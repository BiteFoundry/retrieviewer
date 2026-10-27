#!/usr/bin/env python3
# Native Linux X11 painter for the existing Braille engine. Python 3.6+ standard
# library only: ctypes binds the system libX11.so.6, libXrender.so.1 and
# libXext.so.6 already shipped by the desktop, so there is no compiler, PyPI or
# npm native ABI (works on AlmaLinux 8 / GLIBC 2.28 platform Python).
# No input injection, keyboard/pointer grabs, hotkeys, screen capture, network,
# root access, package installation or target-window modification. Pure Wayland
# sessions are refused: they cannot safely follow another application's window.
import ctypes
import json
import os
import select
import socket
import sys
import threading
import time
from collections import deque

BRAILLE = 0x2800
CELL_WIDTHS = (6, 8, 10, 12, 16)
PROTOCOL_MAX_CELLS = 125000
DEFAULT_MAX_CELLS = 20000
MAX_LINE = 800000
MAX_QUEUED = 4
INK = (248, 242, 232)
INK_ALPHA = 245
# Braille bit -> (column, row) inside the 2x4 dot cell (same as Overlay.cs).
DOTS = ((0, 0), (0, 1), (0, 2), (1, 0), (1, 1), (1, 2), (0, 3), (1, 3))
MIN_TARGET = (160, 120)
TRACK_INTERVAL = 1 / 30.0
RAISE_INTERVAL = 0.25
TERMINALS = ('terminal', 'konsole', 'xterm', 'urxvt', 'rxvt', 'alacritty', 'kitty', 'wezterm', 'tilix',
             'terminator', 'terminology', 'sakura', 'guake', 'tilda', 'yakuake', 'st', 'foot', 'ghostty')


class OverlayError(Exception):
    pass


# ---------------------------------------------------------------- pure helpers
def session_problem(env, platform=None):
    """Return an actionable refusal message, or None when an X11 session is usable."""
    platform = sys.platform if platform is None else platform
    if not platform.startswith('linux'):
        return 'The Linux companion helper runs only on Linux X11 desktops'
    if env.get('WAYLAND_DISPLAY') or env.get('XDG_SESSION_TYPE', '').strip().lower() == 'wayland':
        return ('Wayland session detected. Wayland does not let an app safely follow or stack above another '
                "app's window, so the companion refuses to start. Log out and choose an Xorg session "
                "(for example 'GNOME on Xorg' / 'Standard (X11 display server)' on the login screen), then retry.")
    if not env.get('DISPLAY'):
        return 'DISPLAY is not set. Start the companion from a graphical Xorg desktop session.'
    return None


def strict_int(message, key):
    value = message.get(key)
    if isinstance(value, bool) or not isinstance(value, int):
        raise OverlayError('Invalid overlay field: ' + key)
    return value


def choose_grid(width, height, cell, max_cells=DEFAULT_MAX_CELLS):
    """Columns/rows for a client area; capped so a huge monitor never exceeds max_cells."""
    if cell not in CELL_WIDTHS:
        raise OverlayError('Unsupported cell width')
    max_cells = max(1, min(int(max_cells), PROTOCOL_MAX_CELLS))
    columns, rows = max(0, width // cell), max(0, height // (cell * 2))
    if columns * rows > max_cells:
        scale = (max_cells / float(columns * rows)) ** 0.5
        columns, rows = max(1, int(columns * scale)), max(1, int(rows * scale))
        while columns * rows > max_cells:
            if columns >= rows:
                columns -= 1
            else:
                rows -= 1
    return columns, rows


def parse_frame(message, cell, columns, rows):
    """Validate a cropped frame against the current viewport grid.

    Returns None for the empty frame (hide), else (x, y, columns, rows, lines)."""
    cx, cy = strict_int(message, 'x'), strict_int(message, 'y')
    cols, nrows = strict_int(message, 'columns'), strict_int(message, 'rows')
    text = message.get('text')
    if not isinstance(text, str):
        raise OverlayError('Invalid overlay field: text')
    if cols == 0 and nrows == 0 and text == '':
        return None
    if cols < 1 or nrows < 1 or cols * nrows > PROTOCOL_MAX_CELLS or cx < 0 or cy < 0 \
            or cx + cols > columns or cy + nrows > rows:
        raise OverlayError('Out-of-bounds overlay frame')
    lines = text.split('\n')
    if len(lines) != nrows:
        raise OverlayError('Invalid overlay row count')
    for line in lines:
        if len(line) != cols:
            raise OverlayError('Invalid overlay column count')
        for ch in line:
            if not BRAILLE <= ord(ch) <= BRAILLE + 0xff:
                raise OverlayError('Only Braille cells may cross the overlay bridge')
    return cx, cy, cols, nrows, lines


class DotTiles(object):
    """Premultiplied ARGB32 (little-endian B,G,R,A bytes) tiles for each Braille mask."""

    def __init__(self, cell, ink=INK, alpha=INK_ALPHA, samples=4):
        self.cell, self.width, self.height = cell, cell, cell * 2
        step = cell / 2.0
        radius = max(1.1, step * 0.48) / 2.0
        self.dots = []
        for dx, dy in DOTS:
            cx, cy, cover = (dx + 0.5) * step, (dy + 0.5) * step, {}
            for py in range(max(0, int(cy - radius) - 1), min(self.height, int(cy + radius) + 2)):
                for px in range(max(0, int(cx - radius) - 1), min(self.width, int(cx + radius) + 2)):
                    hits = 0
                    for sy in range(samples):
                        for sx in range(samples):
                            ox, oy = px + (sx + 0.5) / samples - cx, py + (sy + 0.5) / samples - cy
                            if ox * ox + oy * oy <= radius * radius:
                                hits += 1
                    if hits:
                        cover[(px, py)] = hits / float(samples * samples)
            self.dots.append(cover)
        self.ink, self.alpha, self.cache = ink, alpha, {}

    def tile(self, mask):
        rows = self.cache.get(mask)
        if rows is None:
            pixels = bytearray(self.width * self.height * 4)
            cover = {}
            for bit in range(8):
                if mask & (1 << bit):
                    for key, value in self.dots[bit].items():
                        cover[key] = min(1.0, cover.get(key, 0.0) + value)
            for (px, py), value in cover.items():
                a = int(round(self.alpha * value))
                i = (py * self.width + px) * 4
                pixels[i:i + 4] = bytes((self.ink[2] * a // 255, self.ink[1] * a // 255, self.ink[0] * a // 255, a))
            stride = self.width * 4
            rows = tuple(bytes(pixels[y * stride:(y + 1) * stride]) for y in range(self.height))
            self.cache[mask] = rows
        return rows

    def render(self, lines):
        """Rasterize only the cropped Braille box. Fully covers it, so no stale trails."""
        out = []
        for line in lines:
            tiles = [self.tile(ord(ch) - BRAILLE) for ch in line]
            for y in range(self.height):
                out.append(b''.join(t[y] for t in tiles))
        return b''.join(out)

    def dot_count(self, lines):
        return sum(bin(ord(ch) - BRAILLE).count('1') for line in lines for ch in line)


def encode(message):
    return json.dumps(message, separators=(',', ':'), ensure_ascii=True)


class Companion(object):
    """Protocol state machine. The UI backend owns every native resource."""

    def __init__(self, ui, emit, cell=16, max_cells=DEFAULT_MAX_CELLS, test_mode=False):
        if cell not in CELL_WIDTHS:
            raise OverlayError('Unsupported cell width')
        self.ui, self.emit, self.cell, self.max_cells, self.test_mode = ui, emit, cell, max_cells, test_mode
        self.revision, self.visible, self.paused, self.loaded = 0, False, False, False
        self.picking, self.quitting, self.announced = False, False, False
        self.canvas, self.grid, self.status = (0, 0, 0, 0), (0, 0), 'starting'
        self.tiles, self.painted_dots = DotTiles(cell), 0

    # -- input from the Node engine
    def handle(self, message):
        if not isinstance(message, dict):
            raise OverlayError('Invalid overlay message')
        kind = message.get('type')
        if kind == 'quit':
            self.quit()
        elif kind == 'loaded':
            palette = {'cream': (248, 242, 232), 'gold': (231, 184, 103), 'dark': (67, 48, 24)}
            ink = message.get('ink', 'cream')
            if ink not in palette:
                raise OverlayError('Invalid ink')
            self.tiles.ink = palette[ink]
            self.tiles.cache.clear()
            self.loaded = True
            self.set_status('playing')
            if self.test_mode:
                self.press('ball')
        elif kind == 'interaction':
            self.set_status('good!' if message.get('accepted') is True else 'busy, wait')
        elif kind == 'error':
            self.set_status('engine error')
            self.quit()
        elif kind == 'frame':
            # Always acknowledge discarded frames too, otherwise resizing can deadlock the sender.
            painted = self.visible and not self.paused and strict_int(message, 'revision') == self.revision
            if painted:
                self.paint(message)
            self.emit({'type': 'ack', 'painted': painted})
        else:
            raise OverlayError('Unsupported overlay message')

    def paint(self, message):
        frame = parse_frame(message, self.cell, self.grid[0], self.grid[1])
        if frame is None:
            self.ui.hide_pet()
            return
        cx, cy, cols, rows, lines = frame
        data = self.tiles.render(lines)
        self.painted_dots = self.tiles.dot_count(lines)
        self.ui.paint_pet(self.canvas[0] + cx * self.cell, self.canvas[1] + cy * self.cell * 2,
                          cols * self.cell, rows * self.cell * 2, data)

    # -- native control strip / picker
    def press(self, name):
        if self.quitting:
            return
        if name in ('ball', 'treat', 'tug'):
            if self.loaded and not self.paused:
                self.emit({'type': 'interact', 'kind': name})
        elif name == 'pause':
            self.paused = not self.paused
            self.emit({'type': 'pause', 'paused': self.paused})
            self.track(True)
        elif name == 'window':
            self.choose_target()
        elif name == 'quit':
            self.quit()

    def choose_target(self):
        if self.picking or self.quitting:
            return
        self.picking = True
        self.track(True)
        self.ui.open_picker()

    def picker_shown(self, visible):
        self.emit({'type': 'picker', 'visible': bool(visible)})

    def picker_closed(self, attached):
        self.picking = False
        if attached:
            self.paused = False
            self.emit({'type': 'pause', 'paused': False})
        self.emit({'type': 'picker', 'visible': False})
        if not self.quitting:
            if not self.ui.has_target():
                self.set_status('choose a window')
            self.track(True)

    def set_status(self, text):
        self.status = text
        self.ui.status_changed(text)

    # -- geometry/visibility tracking
    def start(self):
        if not self.test_mode:
            self.choose_target()
            self.ui.wait_for_picker()
        self.announced = True
        self.emit({'type': 'ready', 'pickerVisible': bool(self.ui.picker_visible())})
        self.track()

    def track(self, force=False):
        if self.quitting:
            return
        state = self.ui.target_state()  # None, or (x, y, width, height, active)
        show, canvas = False, (0, 0, 0, 0)
        if state is not None:
            canvas = tuple(state[:4])
            show = (not self.picking and (self.test_mode or state[4])
                    and canvas[2] >= MIN_TARGET[0] and canvas[3] >= MIN_TARGET[1])
        grid = choose_grid(canvas[2], canvas[3], self.cell, self.max_cells)
        if force or show != self.visible or canvas != self.canvas or grid != self.grid:
            self.visible, self.canvas, self.grid = show, canvas, grid
            self.revision += 1
            self.ui.hide_pet()
            self.emit({'type': 'viewport', 'revision': self.revision, 'visible': show and not self.paused,
                       'selected': state is not None, 'columns': grid[0], 'rows': grid[1],
                       'cellWidth': self.cell, 'cellHeight': self.cell * 2})
        if self.visible:
            self.ui.show_bar(canvas, self.paused)
            if self.paused:
                self.ui.hide_pet()
        else:
            self.ui.hide_pet()
            self.ui.hide_bar()

    def quit(self):
        if self.quitting:
            return
        self.quitting = True
        try:
            self.ui.close()
        finally:
            self.emit({'type': 'quit'})


# ---------------------------------------------------------------- Xlib ABI
c_ulong, c_long, c_int, c_uint, c_void_p = ctypes.c_ulong, ctypes.c_long, ctypes.c_int, ctypes.c_uint, ctypes.c_void_p
XID = c_ulong  # Window, Atom, Colormap, Pixmap, VisualID, Time are all unsigned long XIDs.


class XVisualInfo(ctypes.Structure):
    _fields_ = [('visual', c_void_p), ('visualid', c_ulong), ('screen', c_int), ('depth', c_int),
                ('c_class', c_int), ('red_mask', c_ulong), ('green_mask', c_ulong), ('blue_mask', c_ulong),
                ('colormap_size', c_int), ('bits_per_rgb', c_int)]


class XSetWindowAttributes(ctypes.Structure):
    _fields_ = [('background_pixmap', XID), ('background_pixel', c_ulong), ('border_pixmap', XID),
                ('border_pixel', c_ulong), ('bit_gravity', c_int), ('win_gravity', c_int),
                ('backing_store', c_int), ('backing_planes', c_ulong), ('backing_pixel', c_ulong),
                ('save_under', c_int), ('event_mask', c_long), ('do_not_propagate_mask', c_long),
                ('override_redirect', c_int), ('colormap', XID), ('cursor', XID)]


class XWindowAttributes(ctypes.Structure):
    _fields_ = [('x', c_int), ('y', c_int), ('width', c_int), ('height', c_int), ('border_width', c_int),
                ('depth', c_int), ('visual', c_void_p), ('root', XID), ('c_class', c_int),
                ('bit_gravity', c_int), ('win_gravity', c_int), ('backing_store', c_int),
                ('backing_planes', c_ulong), ('backing_pixel', c_ulong), ('save_under', c_int),
                ('colormap', XID), ('map_installed', c_int), ('map_state', c_int),
                ('all_event_masks', c_long), ('your_event_mask', c_long), ('do_not_propagate_mask', c_long),
                ('override_redirect', c_int), ('screen', c_void_p)]


class XWMHints(ctypes.Structure):
    _fields_ = [('flags', c_long), ('input', c_int), ('initial_state', c_int), ('icon_pixmap', XID),
                ('icon_window', XID), ('icon_x', c_int), ('icon_y', c_int), ('icon_mask', XID),
                ('window_group', XID)]


class XImageFuncs(ctypes.Structure):
    _fields_ = [(name, c_void_p) for name in
                ('create_image', 'destroy_image', 'get_pixel', 'put_pixel', 'sub_image', 'add_pixel')]


class XImage(ctypes.Structure):
    _fields_ = [('width', c_int), ('height', c_int), ('xoffset', c_int), ('format', c_int),
                ('data', c_void_p), ('byte_order', c_int), ('bitmap_unit', c_int),
                ('bitmap_bit_order', c_int), ('bitmap_pad', c_int), ('depth', c_int),
                ('bytes_per_line', c_int), ('bits_per_pixel', c_int), ('red_mask', c_ulong),
                ('green_mask', c_ulong), ('blue_mask', c_ulong), ('obdata', c_void_p), ('f', XImageFuncs)]


class XRectangle(ctypes.Structure):
    _fields_ = [('x', ctypes.c_short), ('y', ctypes.c_short), ('width', ctypes.c_ushort),
                ('height', ctypes.c_ushort)]


class XRenderDirectFormat(ctypes.Structure):
    _fields_ = [(name, ctypes.c_short) for name in
                ('red', 'redMask', 'green', 'greenMask', 'blue', 'blueMask', 'alpha', 'alphaMask')]


class XRenderPictFormat(ctypes.Structure):
    _fields_ = [('id', XID), ('type', c_int), ('depth', c_int), ('direct', XRenderDirectFormat),
                ('colormap', XID)]


class XErrorEvent(ctypes.Structure):
    _fields_ = [('type', c_int), ('display', c_void_p), ('resourceid', XID), ('serial', c_ulong),
                ('error_code', ctypes.c_ubyte), ('request_code', ctypes.c_ubyte), ('minor_code', ctypes.c_ubyte)]


class XAnyEvent(ctypes.Structure):
    _fields_ = [('type', c_int), ('serial', c_ulong), ('send_event', c_int), ('display', c_void_p),
                ('window', XID)]


class XButtonEvent(ctypes.Structure):
    _fields_ = XAnyEvent._fields_ + [('root', XID), ('subwindow', XID), ('time', c_ulong), ('x', c_int),
                                     ('y', c_int), ('x_root', c_int), ('y_root', c_int), ('state', c_uint),
                                     ('button', c_uint), ('same_screen', c_int)]


class XExposeEvent(ctypes.Structure):
    _fields_ = XAnyEvent._fields_ + [('x', c_int), ('y', c_int), ('width', c_int), ('height', c_int),
                                     ('count', c_int)]


class XClientMessageEvent(ctypes.Structure):
    _fields_ = XAnyEvent._fields_ + [('message_type', XID), ('format', c_int), ('l', c_long * 5)]


class XEvent(ctypes.Union):
    _fields_ = [('type', c_int), ('xany', XAnyEvent), ('xbutton', XButtonEvent), ('xexpose', XExposeEvent),
                ('xclient', XClientMessageEvent), ('pad', c_long * 24)]


ERROR_HANDLER = ctypes.CFUNCTYPE(c_int, c_void_p, ctypes.POINTER(XErrorEvent))
IO_ERROR_HANDLER = ctypes.CFUNCTYPE(c_int, c_void_p)

# X.h / Xutil.h / shapeconst.h / render.h constants
TrueColor, InputOutput, AllocNone, ZPixmap, LSBFirst = 4, 1, 0, 2, 0
CWBackPixel, CWBorderPixel, CWOverrideRedirect, CWEventMask, CWColormap = 1 << 1, 1 << 3, 1 << 9, 1 << 11, 1 << 13
ButtonPressMask, ExposureMask, StructureNotifyMask = 1 << 2, 1 << 15, 1 << 17
ButtonPress, Expose, MapNotify, ClientMessage = 4, 12, 19, 33
IsViewable, Success, PropModeReplace, InputHint = 2, 0, 0, 1
XA_ATOM, XA_CARDINAL, XA_STRING, XA_WINDOW = 4, 6, 31, 33
BadWindow, BadDrawable = 3, 9
ShapeBounding, ShapeInput, ShapeSet, Unsorted = 0, 2, 0, 0
PictTypeDirect = 1


def _bind(lib, name, restype, argtypes):
    fn = getattr(lib, name)
    fn.restype, fn.argtypes = restype, argtypes
    return fn


def load_libraries(loader=ctypes.CDLL):
    """Bind exact prototypes of the system X client libraries (never downloaded)."""
    try:
        x11, xrender, xext = loader('libX11.so.6'), loader('libXrender.so.1'), loader('libXext.so.6')
    except OSError as error:
        raise OverlayError('Missing X11 client library (' + str(error) + '). Install the desktop session '
                           'packages libX11, libXrender and libXext with your system package manager.')
    P, I, U, UL, L = c_void_p, c_int, c_uint, c_ulong, c_long
    PI, PUL = ctypes.POINTER(c_int), ctypes.POINTER(c_ulong)
    x = type('Xlib', (), {})()
    for name, res, args in (
            ('XOpenDisplay', P, [ctypes.c_char_p]), ('XCloseDisplay', I, [P]), ('XDefaultScreen', I, [P]),
            ('XRootWindow', UL, [P, I]), ('XConnectionNumber', I, [P]), ('XFlush', I, [P]), ('XSync', I, [P, I]),
            ('XPending', I, [P]), ('XNextEvent', I, [P, ctypes.POINTER(XEvent)]),
            ('XInternAtom', UL, [P, ctypes.c_char_p, I]), ('XFree', I, [P]),
            ('XGetWindowProperty', I, [P, UL, UL, L, L, I, UL, PUL, PI, PUL, PUL,
                                       ctypes.POINTER(ctypes.POINTER(ctypes.c_ubyte))]),
            ('XChangeProperty', I, [P, UL, UL, UL, I, I, P, I]),
            ('XGetSelectionOwner', UL, [P, UL]),
            ('XMatchVisualInfo', I, [P, I, I, I, ctypes.POINTER(XVisualInfo)]),
            ('XCreateColormap', UL, [P, UL, P, I]), ('XFreeColormap', I, [P, UL]),
            ('XCreateWindow', UL, [P, UL, I, I, U, U, U, I, U, P, UL, ctypes.POINTER(XSetWindowAttributes)]),
            ('XDestroyWindow', I, [P, UL]), ('XMapRaised', I, [P, UL]), ('XUnmapWindow', I, [P, UL]),
            ('XRaiseWindow', I, [P, UL]), ('XMoveResizeWindow', I, [P, UL, I, I, U, U]),
            ('XStoreName', I, [P, UL, ctypes.c_char_p]), ('XSetWMHints', I, [P, UL, ctypes.POINTER(XWMHints)]),
            ('XSetWMProtocols', I, [P, UL, PUL, I]),
            ('XGetWindowAttributes', I, [P, UL, ctypes.POINTER(XWindowAttributes)]),
            ('XTranslateCoordinates', I, [P, UL, UL, I, I, PI, PI, PUL]),
            ('XGetInputFocus', I, [P, PUL, PI]),
            ('XCreateGC', P, [P, UL, UL, P]), ('XFreeGC', I, [P, P]), ('XSetForeground', I, [P, P, UL]),
            ('XFillRectangle', I, [P, UL, P, I, I, U, U]), ('XDrawString', I, [P, UL, P, I, I, ctypes.c_char_p, I]),
            ('XInitImage', I, [ctypes.POINTER(XImage)]),
            ('XPutImage', I, [P, UL, P, ctypes.POINTER(XImage), I, I, I, I, U, U]),
            ('XSetErrorHandler', P, [ERROR_HANDLER]), ('XSetIOErrorHandler', P, [IO_ERROR_HANDLER])):
        setattr(x, name, _bind(x11, name, res, args))
    x.XRenderQueryExtension = _bind(xrender, 'XRenderQueryExtension', I, [P, PI, PI])
    x.XRenderFindVisualFormat = _bind(xrender, 'XRenderFindVisualFormat', ctypes.POINTER(XRenderPictFormat), [P, P])
    x.XShapeQueryExtension = _bind(xext, 'XShapeQueryExtension', I, [P, PI, PI])
    x.XShapeQueryVersion = _bind(xext, 'XShapeQueryVersion', I, [P, PI, PI])
    x.XShapeCombineRectangles = _bind(xext, 'XShapeCombineRectangles', None,
                                      [P, UL, I, I, I, ctypes.POINTER(XRectangle), I, I, I])
    x.XShapeGetRectangles = _bind(xext, 'XShapeGetRectangles', ctypes.POINTER(XRectangle), [P, UL, I, PI, PI])
    return x


def ascii_label(text, limit):
    text = ''.join(ch if ' ' <= ch <= '~' else '?' for ch in text)
    return text if len(text) <= limit else text[:limit - 3] + '...'


class XDisplay(object):
    """Owned X11 resources: one ARGB pet window, one control strip, one picker."""
    BAR_BUTTONS = (('ball', 'Ball'), ('treat', 'Treat'), ('tug', 'Tug'), ('window', 'Window'), ('pause', 'Pause'), ('quit', 'Quit'), ('toggle', 'Hide'))

    def __init__(self, display_name=None, require_compositor=True, x=None):
        self.x = x or load_libraries()
        self.errors, self.companion, self.dpy = [], None, None
        self._error_cb = ERROR_HANDLER(self._on_error)
        self._io_cb = IO_ERROR_HANDLER(self._on_io_error)
        self.x.XSetErrorHandler(self._error_cb)
        self.x.XSetIOErrorHandler(self._io_cb)
        self.dpy = self.x.XOpenDisplay(display_name.encode() if display_name else None)
        if not self.dpy:
            raise OverlayError('Cannot open X display ' + repr(display_name or os.environ.get('DISPLAY', '')))
        self.windows, self.gcs, self.colormap = [], [], 0
        self.target = self.target_pid = None
        self.pet = self.bar = self.picker = 0
        self.pet_mapped = self.bar_mapped = self.picker_mapped = False
        self.last_image = None
        self.bar_canvas, self.bar_paused, self.status = None, False, 'starting'
        self.bar_collapsed, self.bar_target_canvas = False, None
        self.picker_items, self.picker_index, self.last_raise, self.owned_target = [], 0, 0.0, False
        self.screen = self.x.XDefaultScreen(self.dpy)
        self.root = self.x.XRootWindow(self.dpy, self.screen)
        self.atoms = {}
        try:
            self._check_extensions(require_compositor)
        except Exception:
            self.close()
            raise

    # -- capability checks: clear errors instead of an opaque black window
    def atom(self, name):
        if name not in self.atoms:
            self.atoms[name] = self.x.XInternAtom(self.dpy, name.encode(), 0)
        return self.atoms[name]

    def _check_extensions(self, require_compositor):
        a, b = c_int(), c_int()
        if not self.x.XShapeQueryExtension(self.dpy, ctypes.byref(a), ctypes.byref(b)):
            raise OverlayError('The X server lacks the SHAPE extension needed for a click-through overlay')
        if not self.x.XShapeQueryVersion(self.dpy, ctypes.byref(a), ctypes.byref(b)) or (a.value, b.value) < (1, 1):
            raise OverlayError('The X server SHAPE extension is older than 1.1 (no input shapes)')
        if not self.x.XRenderQueryExtension(self.dpy, ctypes.byref(a), ctypes.byref(b)):
            raise OverlayError('The X server lacks the RENDER extension needed for transparency')
        info = XVisualInfo()
        if not self.x.XMatchVisualInfo(self.dpy, self.screen, 32, TrueColor, ctypes.byref(info)):
            raise OverlayError('No 32-bit ARGB visual is available on this X screen')
        fmt = self.x.XRenderFindVisualFormat(self.dpy, info.visual)
        if not fmt or fmt.contents.type != PictTypeDirect or fmt.contents.direct.alphaMask != 0xff \
                or fmt.contents.direct.alpha != 24 or (info.red_mask, info.green_mask, info.blue_mask) != (0xff0000, 0xff00, 0xff):
            raise OverlayError('The 32-bit visual is not XRender ARGB32')
        self.visual = info.visual
        self.compositor = bool(self.x.XGetSelectionOwner(self.dpy, self.atom('_NET_WM_CM_S%d' % self.screen)))
        if require_compositor and not self.compositor:
            raise OverlayError('No compositing manager is running, so a transparent overlay would paint an opaque '
                               'black box. Enable desktop compositing (most GNOME/KDE/Xfce sessions do) and retry.')
        supported = self.prop_values(self.root, '_NET_SUPPORTED', XA_ATOM)
        if require_compositor and not {self.atom('_NET_CLIENT_LIST'), self.atom('_NET_ACTIVE_WINDOW')} <= set(supported):
            raise OverlayError('The window manager does not publish EWMH _NET_CLIENT_LIST/_NET_ACTIVE_WINDOW, '
                               'so a target window cannot be followed safely')
        self.colormap = self.x.XCreateColormap(self.dpy, self.root, self.visual, AllocNone)

    # -- error handling: a target window may disappear at any time
    def _on_error(self, display, event):
        e = event.contents
        self.errors.append((e.error_code, e.request_code, e.resourceid))
        return 0

    def _on_io_error(self, display):
        try:
            sys.stdout.write(encode({'type': 'error', 'message': 'X display connection lost'}) + '\n')
            sys.stdout.flush()
        finally:
            os._exit(1)
        return 0

    def checked(self, resource):
        """Sync and consume async errors; True when the given foreign resource vanished."""
        self.x.XSync(self.dpy, 0)
        errors, self.errors = self.errors, []
        gone = False
        for code, request, rid in errors:
            if rid == resource and code in (BadWindow, BadDrawable):
                gone = True
            else:
                raise OverlayError('X protocol error %d (request %d)' % (code, request))
        return gone

    def prop_values(self, window, name, kind, limit=4096):
        actual, fmt, count, after = c_ulong(), c_int(), c_ulong(), c_ulong()
        data = ctypes.POINTER(ctypes.c_ubyte)()
        status = self.x.XGetWindowProperty(self.dpy, window, self.atom(name), 0, limit, 0, kind,
                                           ctypes.byref(actual), ctypes.byref(fmt), ctypes.byref(count),
                                           ctypes.byref(after), ctypes.byref(data))
        if status != Success or not data:
            return []
        try:
            if fmt.value == 32:  # format-32 properties arrive as C longs, even on 64-bit
                values = ctypes.cast(data, ctypes.POINTER(c_ulong))
                return [values[i] for i in range(count.value)]
            if fmt.value == 8:
                return ctypes.string_at(data, count.value)
            return []
        finally:
            self.x.XFree(data)

    # -- window creation
    def _window(self, x, y, w, h, override, mask):
        attrs = XSetWindowAttributes()
        attrs.background_pixel, attrs.border_pixel = 0, 0
        attrs.override_redirect, attrs.colormap, attrs.event_mask = 1 if override else 0, self.colormap, mask
        win = self.x.XCreateWindow(self.dpy, self.root, x, y, max(1, w), max(1, h), 0, 32, InputOutput,
                                   self.visual, CWBackPixel | CWBorderPixel | CWOverrideRedirect | CWEventMask
                                   | CWColormap, ctypes.byref(attrs))
        if not win:
            raise OverlayError('Cannot create overlay window')
        self.windows.append(win)
        pid = c_ulong(os.getpid())
        self.x.XChangeProperty(self.dpy, win, self.atom('_NET_WM_PID'), XA_CARDINAL, 32, PropModeReplace,
                               ctypes.cast(ctypes.byref(pid), c_void_p), 1)
        return win

    def _gc(self, win):
        gc = self.x.XCreateGC(self.dpy, win, 0, None)
        self.gcs.append(gc)
        return gc

    def create(self):
        self.pet = self._window(0, 0, 1, 1, True, ExposureMask)
        kind = c_ulong(self.atom('_NET_WM_WINDOW_TYPE_DND'))  # compositors draw no shadow/frame for DND
        self.x.XChangeProperty(self.dpy, self.pet, self.atom('_NET_WM_WINDOW_TYPE'), XA_ATOM, 32, PropModeReplace,
                               ctypes.cast(ctypes.byref(kind), c_void_p), 1)
        # Empty input shape: every pointer event passes through to the target.
        self.x.XShapeCombineRectangles(self.dpy, self.pet, ShapeInput, 0, 0, None, 0, ShapeSet, Unsorted)
        self.pet_gc = self._gc(self.pet)
        self.bar = self._window(0, 0, 360, 34, True, ExposureMask | ButtonPressMask)
        self.bar_gc = self._gc(self.bar)
        if self.checked(0):
            raise OverlayError('Cannot create overlay windows')

    def input_shape_rectangles(self, win):
        count, order = c_int(), c_int()
        rects = self.x.XShapeGetRectangles(self.dpy, win, ShapeInput, ctypes.byref(count), ctypes.byref(order))
        if rects:
            self.x.XFree(rects)
        return count.value

    # -- pet painting
    def paint_pet(self, x, y, w, h, data):
        self.x.XMoveResizeWindow(self.dpy, self.pet, x, y, w, h)
        if not self.pet_mapped:
            self.x.XMapRaised(self.dpy, self.pet)
            self.pet_mapped = True
        self.last_image = (w, h, data)
        self._put(self.pet, self.pet_gc, w, h, data)

    def _put(self, win, gc, w, h, data):
        image = XImage()
        image.width, image.height, image.format, image.depth = w, h, ZPixmap, 32
        image.byte_order, image.bitmap_unit, image.bitmap_bit_order, image.bitmap_pad = LSBFirst, 32, LSBFirst, 32
        image.bytes_per_line, image.bits_per_pixel = w * 4, 32
        image.red_mask, image.green_mask, image.blue_mask = 0xff0000, 0xff00, 0xff
        buffer = ctypes.c_char_p(data)  # borrows the bytes; XPutImage copies them synchronously
        image.data = ctypes.cast(buffer, c_void_p)
        if not self.x.XInitImage(ctypes.byref(image)):
            raise OverlayError('XInitImage rejected the ARGB32 image')
        self.x.XPutImage(self.dpy, win, gc, ctypes.byref(image), 0, 0, 0, 0, w, h)
        self.x.XFlush(self.dpy)

    def hide_pet(self):
        self.last_image = None
        if self.pet_mapped:
            self.x.XUnmapWindow(self.dpy, self.pet)
            self.pet_mapped = False

    # -- control strip
    def show_bar(self, canvas, paused):
        self.bar_target_canvas = canvas
        width, height = (66 if self.bar_collapsed else 6 + 58 * len(self.BAR_BUTTONS) + 120), 34
        x = max(canvas[0], canvas[0] + canvas[2] - width - 10)
        geometry = (x, canvas[1] + 10, paused, width)
        if geometry != self.bar_canvas:
            self.bar_canvas, self.bar_paused = geometry, paused
            self.x.XMoveResizeWindow(self.dpy, self.bar, x, canvas[1] + 10, width, height)
            self.draw_bar()
        if not self.bar_mapped:
            self.x.XMapRaised(self.dpy, self.bar)
            self.bar_mapped = True
        now = time.time()
        if now - self.last_raise >= RAISE_INTERVAL:  # the WM may restack the active target over us
            self.last_raise = now
            if self.pet_mapped:
                self.x.XRaiseWindow(self.dpy, self.pet)
            self.x.XRaiseWindow(self.dpy, self.bar)

    def hide_bar(self):
        if self.bar_mapped:
            self.x.XUnmapWindow(self.dpy, self.bar)
            self.bar_mapped, self.bar_canvas = False, None

    def status_changed(self, text):
        self.status = text
        if self.bar_mapped:
            self.draw_bar()

    def draw_bar(self):
        buttons = (('toggle', 'Menu'),) if self.bar_collapsed else self.BAR_BUTTONS
        gc, width = self.bar_gc, (66 if self.bar_collapsed else 6 + 58 * len(buttons) + 120)
        self.x.XSetForeground(self.dpy, gc, 0xff1c1e22)
        self.x.XFillRectangle(self.dpy, self.bar, gc, 0, 0, width, 34)
        for i, (name, label) in enumerate(buttons):
            if name == 'pause' and self.bar_paused:
                label = 'Resume'
            self.x.XSetForeground(self.dpy, gc, 0xff30333a)
            self.x.XFillRectangle(self.dpy, self.bar, gc, 6 + 58 * i, 4, 54, 26)
            self.x.XSetForeground(self.dpy, gc, 0xffffffff)
            self.x.XDrawString(self.dpy, self.bar, gc, 12 + 58 * i, 21, label.encode(), len(label))
        if not self.bar_collapsed:
            status = ascii_label(self.status, 18)
            self.x.XDrawString(self.dpy, self.bar, gc, 8 + 58 * len(buttons), 21, status.encode(), len(status))

    def bar_hit(self, x, y):
        if 4 <= y <= 30 and x >= 6:
            index, offset = divmod(x - 6, 58)
            buttons = (('toggle', 'Menu'),) if self.bar_collapsed else self.BAR_BUTTONS
            if index < len(buttons) and offset < 54:
                return buttons[index][0]
        return None

    # -- explicit window picker (EWMH client list; titles/process names only)
    def client_windows(self):
        mine, result = os.getpid(), []
        for win in self.prop_values(self.root, '_NET_CLIENT_LIST', XA_WINDOW):
            if win in self.windows:
                continue
            pids = self.prop_values(win, '_NET_WM_PID', XA_CARDINAL)
            if self.checked(win):
                continue
            pid = pids[0] if pids else None
            if pid == mine:
                continue
            name = self.prop_values(win, '_NET_WM_NAME', self.atom('UTF8_STRING'))
            if isinstance(name, bytes) and name:
                title = name.decode('utf-8', 'replace')
            else:
                name = self.prop_values(win, 'WM_NAME', XA_STRING)
                title = name.decode('latin-1') if isinstance(name, bytes) else ''
            if self.checked(win) or not title:
                continue
            process = ''
            if pid:
                try:
                    with open('/proc/%d/comm' % pid) as handle:
                        process = handle.read(64).strip()
                except (IOError, OSError):
                    pass
            terminal = any(word == process.lower() or (len(word) > 2 and word in process.lower()) for word in TERMINALS)
            result.append({'window': win, 'pid': pid, 'terminal': terminal,
                           'label': ('[terminal] ' if terminal else '') + title + (' - ' + process if process else '')})
        result.sort(key=lambda item: (not item['terminal'], item['label'].lower()))
        return result

    PICKER_W, PICKER_ROWS = 600, 14

    def open_picker(self):
        if self.picker:
            return
        self.picker_items, self.picker_index = self.client_windows(), 0
        height = 72 + 20 * self.PICKER_ROWS + 44
        self.picker = self._window(0, 0, self.PICKER_W, height, False, ExposureMask | ButtonPressMask | StructureNotifyMask)
        self.picker_gc = self._gc(self.picker)
        self.x.XStoreName(self.dpy, self.picker, b'Retrieviewer - choose a window')
        hints = XWMHints()
        hints.flags, hints.input = InputHint, 0  # ask the WM not to move keyboard focus to the picker
        self.x.XSetWMHints(self.dpy, self.picker, ctypes.byref(hints))
        protocol = c_ulong(self.atom('WM_DELETE_WINDOW'))
        self.x.XSetWMProtocols(self.dpy, self.picker, ctypes.byref(protocol), 1)
        self.x.XMapRaised(self.dpy, self.picker)
        self.x.XFlush(self.dpy)

    def picker_visible(self):
        return bool(self.picker and self.picker_mapped)

    def wait_for_picker(self, timeout=1.0):
        end = time.time() + timeout
        while self.picker and not self.picker_mapped and time.time() < end:
            self.pump()
            time.sleep(0.01)

    def close_picker(self, attach):
        if not self.picker:
            return
        if attach and self.picker_items:
            item = self.picker_items[self.picker_index]
            self.target, self.target_pid = item['window'], item['pid']
        self._destroy(self.picker)
        self.gcs.remove(self.picker_gc)
        self.x.XFreeGC(self.dpy, self.picker_gc)
        self.picker, self.picker_mapped = 0, False
        self.companion.picker_closed(bool(attach and self.picker_items))

    def draw_picker(self):
        gc, d, w = self.picker_gc, self.dpy, self.picker
        self.x.XSetForeground(d, gc, 0xff202227)
        self.x.XFillRectangle(d, w, gc, 0, 0, self.PICKER_W, 72 + 20 * self.PICKER_ROWS + 44)
        self.x.XSetForeground(d, gc, 0xffffffff)
        for i, line in enumerate(('Choose the window Retrieviewer should keep company.',
                                  'Only its position/size is followed; contents are never read.')):
            self.x.XDrawString(d, w, gc, 14, 22 + 18 * i, line.encode(), len(line))
        if not self.picker_items:
            text = '(no windows found - press Refresh)'
            self.x.XDrawString(d, w, gc, 14, 90, text.encode(), len(text))
        for i, item in enumerate(self.picker_items[:self.PICKER_ROWS]):
            top = 64 + 20 * i
            if i == self.picker_index:
                self.x.XSetForeground(d, gc, 0xff3b5bdb)
                self.x.XFillRectangle(d, w, gc, 8, top, self.PICKER_W - 16, 20)
            self.x.XSetForeground(d, gc, 0xffffffff)
            label = ascii_label(item['label'], 92)
            self.x.XDrawString(d, w, gc, 14, top + 15, label.encode(), len(label))
        for label, left in self._picker_buttons():
            self.x.XSetForeground(d, gc, 0xff3a3d45)
            self.x.XFillRectangle(d, w, gc, left, self._button_top(), 120, 30)
            self.x.XSetForeground(d, gc, 0xffffffff)
            self.x.XDrawString(d, w, gc, left + 12, self._button_top() + 20, label.encode(), len(label))

    def _button_top(self):
        return 72 + 20 * self.PICKER_ROWS + 6

    def _picker_buttons(self):
        return (('Refresh', 14), ('Attach', self.PICKER_W - 268), ('Cancel', self.PICKER_W - 134))

    def picker_click(self, x, y):
        if 64 <= y < 64 + 20 * self.PICKER_ROWS:
            index = (y - 64) // 20
            if index < min(len(self.picker_items), self.PICKER_ROWS):
                self.picker_index = index
                self.draw_picker()
            return
        top = self._button_top()
        for label, left in self._picker_buttons():
            if left <= x < left + 120 and top <= y < top + 30:
                if label == 'Refresh':
                    self.picker_items, self.picker_index = self.client_windows(), 0
                    self.draw_picker()
                else:
                    self.close_picker(label == 'Attach')
                return

    # -- target tracking (read-only queries; never configures the target)
    def has_target(self):
        return self.target is not None

    def target_state(self):
        if self.target is None:
            return None
        win = self.target
        clients = self.prop_values(self.root, '_NET_CLIENT_LIST', XA_WINDOW)
        pids = self.prop_values(win, '_NET_WM_PID', XA_CARDINAL)
        attrs = XWindowAttributes()
        ok = self.x.XGetWindowAttributes(self.dpy, win, ctypes.byref(attrs))
        dx, dy, child = c_int(), c_int(), c_ulong()
        moved = self.x.XTranslateCoordinates(self.dpy, win, self.root, 0, 0, ctypes.byref(dx), ctypes.byref(dy),
                                             ctypes.byref(child))
        states = self.prop_values(win, '_NET_WM_STATE', XA_ATOM)
        gone = self.checked(win)
        if gone or not ok or not moved or (win not in clients and not self.owned_target) \
                or (self.target_pid is not None and (pids[:1] or [None])[0] != self.target_pid):
            self.target = self.target_pid = None
            return None
        if attrs.map_state != IsViewable or self.atom('_NET_WM_STATE_HIDDEN') in states:
            return (dx.value, dy.value, 0, 0, False)
        active = self.prop_values(self.root, '_NET_ACTIVE_WINDOW', XA_WINDOW)
        return (dx.value, dy.value, attrs.width, attrs.height, bool(active) and active[0] == win)

    # -- events
    def pump(self):
        event = XEvent()
        while self.dpy and self.x.XPending(self.dpy):
            self.x.XNextEvent(self.dpy, ctypes.byref(event))
            win, kind = event.xany.window, event.type
            if kind == Expose and event.xexpose.count == 0:
                if win == self.bar:
                    self.draw_bar()
                elif win == self.picker:
                    self.draw_picker()
                elif win == self.pet and self.last_image:
                    self._put(self.pet, self.pet_gc, *self.last_image)
            elif kind == ButtonPress and event.xbutton.button == 1:
                if win == self.bar and self.companion:
                    name = self.bar_hit(event.xbutton.x, event.xbutton.y)
                    if name == 'toggle':
                        self.bar_collapsed = not self.bar_collapsed
                        self.show_bar(self.bar_target_canvas, self.bar_paused)
                    elif name:
                        self.companion.press(name)
                elif win == self.picker:
                    self.picker_click(event.xbutton.x, event.xbutton.y)
            elif kind == MapNotify and win == self.picker and not self.picker_mapped:
                self.picker_mapped = True
                if self.companion and self.companion.announced:
                    self.companion.picker_shown(True)
            elif kind == ClientMessage and win == self.picker and event.xclient.l[0] == self.atom('WM_DELETE_WINDOW'):
                self.close_picker(False)
            if not self.dpy:
                return
        if self.errors and self.dpy:
            self.checked(0)

    def fileno(self):
        return self.x.XConnectionNumber(self.dpy)

    def _destroy(self, win):
        if win in self.windows:
            self.windows.remove(win)
            self.x.XDestroyWindow(self.dpy, win)

    def close(self):
        """Release every owned X resource. Never touches the target window."""
        if not self.dpy:
            return
        for gc in self.gcs:
            self.x.XFreeGC(self.dpy, gc)
        for win in list(self.windows):
            self._destroy(win)
        if self.colormap:
            self.x.XFreeColormap(self.dpy, self.colormap)
        self.x.XSync(self.dpy, 1)
        self.x.XCloseDisplay(self.dpy)
        self.dpy, self.gcs, self.windows, self.colormap = None, [], [], 0


# ---------------------------------------------------------------- process glue
_output_lock = threading.Lock()


def emit(message):
    with _output_lock:
        try:
            sys.stdout.write(encode(message) + '\n')
            sys.stdout.flush()
        except (IOError, OSError, ValueError):
            os._exit(0)


def read_input(inbox, wake):
    """Stdin reader thread. Xlib is only ever used from the main thread."""
    stream = sys.stdin.buffer
    try:
        while True:
            line = stream.readline(MAX_LINE + 2)
            if not line:
                break
            if len(line) > MAX_LINE:
                inbox.append(OverlayError('Oversized overlay message'))
                break
            try:
                inbox.append(json.loads(line.decode('utf-8')))
            except ValueError:
                inbox.append(OverlayError('Malformed overlay message'))
                break
            os.write(wake, b'.')
    except (IOError, OSError):
        pass
    inbox.append(None)  # stdin EOF: exit and release resources
    try:
        os.write(wake, b'.')
    except OSError:
        pass


def single_instance(test):
    """Abstract unix socket lock: released by the kernel even after a crash; no files."""
    lock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    name = '\0bitefoundry-retrieviewer-overlay-%d' % os.getuid() + ('-diag-%d' % os.getpid() if test else '')
    try:
        lock.bind(name)
    except OSError:
        lock.close()
        raise OverlayError('A Retrieviewer companion is already running')
    return lock


def run(argv):
    test = argv == ['--ipc-test']
    cell = 16
    if argv[:1] == ['--cell'] and len(argv) == 2 and argv[1].isdigit():
        cell = int(argv[1])
    elif argv and not test:
        raise OverlayError('Unsupported native painter argument')
    problem = session_problem(os.environ)
    if problem:
        raise OverlayError(problem)
    lock, ui = single_instance(test), None
    try:
        ui = XDisplay()
        ui.create()
        companion = Companion(ui, emit, cell=cell, test_mode=test)
        ui.companion = companion
        if test:  # owned off-screen stand-in target; no user window is touched
            ui.target = ui._window(-12000, -12000, 1280, 800, True, 0)
            ui.owned_target = True
            ui.x.XMapRaised(ui.dpy, ui.target)
        inbox, (wake_r, wake_w) = deque(), os.pipe()
        reader = threading.Thread(target=read_input, args=(inbox, wake_w))
        reader.daemon = True
        reader.start()
        companion.start()
        last_track = 0.0
        while not companion.quitting:
            ui.pump()
            if len(inbox) > MAX_QUEUED + 1:
                raise OverlayError('Overlay input queue overflow')
            while inbox and not companion.quitting:
                message = inbox.popleft()
                if message is None:
                    companion.quit()
                elif isinstance(message, Exception):
                    raise message
                else:
                    companion.handle(message)
            if companion.quitting:
                break
            now = time.time()
            if now - last_track >= TRACK_INTERVAL:
                last_track = now
                companion.track()
            ui.x.XFlush(ui.dpy)
            ready, _, _ = select.select([ui.fileno(), wake_r], [], [], TRACK_INTERVAL)
            if wake_r in ready:
                os.read(wake_r, 4096)
        return 0
    finally:
        if ui:
            ui.close()
        lock.close()


def check(env=None):
    """--check-json: environment diagnostics only; never creates windows."""
    env = os.environ if env is None else env
    report = {'type': 'check', 'python': '.'.join(map(str, sys.version_info[:3])), 'platform': sys.platform,
              'ok': False, 'errors': []}
    problem = session_problem(env)
    if problem:
        report['errors'].append(problem)
        return report
    try:
        ui = XDisplay(require_compositor=True)
        report.update(compositor=ui.compositor, argb32=True, shapeInput=True, ewmh=True)
        ui.close()
        report['ok'] = True
    except OverlayError as error:
        report['errors'].append(str(error))
    return report


def self_test(display_name):
    """Owned windows only on an explicitly named (e.g. Xvfb) display: no user window, focus or input."""
    ui = XDisplay(display_name, require_compositor=False)
    result = {'type': 'self-test', 'display': display_name, 'compositor': ui.compositor}
    try:
        focus_before, revert = c_ulong(), c_int()
        ui.x.XGetInputFocus(ui.dpy, ctypes.byref(focus_before), ctypes.byref(revert))
        ui.create()
        target = ui._window(40, 30, 800, 600, True, 0)
        ui.x.XMapRaised(ui.dpy, target)
        ui.target, ui.owned_target = target, True
        sent = []
        companion = Companion(ui, sent.append, cell=16, test_mode=True)
        ui.companion = companion
        companion.start()
        viewport = sent[-1]
        frame = {'type': 'frame', 'revision': viewport['revision'], 'x': 2, 'y': 1, 'columns': 3, 'rows': 2,
                 'text': '⣿⠁⢀\n⠀⣿⡇'}
        companion.handle(frame)

        def pet_origin():
            dx, dy, child = c_int(), c_int(), c_ulong()
            ui.x.XSync(ui.dpy, 0)
            ui.x.XTranslateCoordinates(ui.dpy, ui.pet, ui.root, 0, 0, ctypes.byref(dx), ctypes.byref(dy), ctypes.byref(child))
            return dx.value, dy.value
        result['painted'] = sent[-1] == {'type': 'ack', 'painted': True} and companion.painted_dots == 22
        result['followGeometry'] = pet_origin() == (40 + 2 * 16, 30 + 1 * 32)
        result['inputShapeEmpty'] = ui.input_shape_rectangles(ui.pet) == 0
        ui.x.XMoveResizeWindow(ui.dpy, target, 140, 90, 900, 640)
        ui.x.XSync(ui.dpy, 0)
        companion.track()
        stale = dict(frame, revision=viewport['revision'])
        companion.handle(stale)
        result['staleFrameDiscarded'] = sent[-1] == {'type': 'ack', 'painted': False} and not ui.pet_mapped
        companion.handle(dict(frame, revision=companion.revision))
        result['followMoved'] = pet_origin() == (140 + 32, 90 + 32)
        ui.x.XUnmapWindow(ui.dpy, target)
        ui.x.XSync(ui.dpy, 0)
        companion.track()
        result['hideWhenUnmapped'] = not ui.pet_mapped and not companion.visible
        ui._destroy(target)
        ui.x.XSync(ui.dpy, 0)
        ui.owned_target = False
        companion.track()
        result['targetGone'] = ui.target is None and sent[-1].get('selected') is False
        focus_after = c_ulong()
        ui.x.XGetInputFocus(ui.dpy, ctypes.byref(focus_after), ctypes.byref(revert))
        result['focusPreserved'] = focus_after.value == focus_before.value
        companion.quit()
        result['released'] = ui.dpy is None and sent[-1] == {'type': 'quit'}
        result['passed'] = all(result[k] for k in ('painted', 'followGeometry', 'inputShapeEmpty', 'staleFrameDiscarded',
                                                    'followMoved', 'hideWhenUnmapped', 'targetGone', 'focusPreserved',
                                                    'released'))
        return result
    finally:
        ui.close()


def main(argv):
    try:
        if argv == ['--check-json']:
            report = check()
            print(encode(report))
            return 0 if report['ok'] else 2
        if argv[:1] == ['--self-test']:
            if len(argv) != 2 or not argv[1].startswith(':'):
                raise OverlayError('--self-test requires an explicit isolated display such as :99 (Xvfb)')
            problem = session_problem({'DISPLAY': argv[1]})
            if problem:
                raise OverlayError(problem)
            report = self_test(argv[1])
            print(encode(report))
            return 0 if report['passed'] else 1
        return run(argv)
    except OverlayError as error:
        emit({'type': 'error', 'message': str(error)})
        return 2
    except Exception as error:  # never leave the Node side waiting silently
        emit({'type': 'error', 'message': '%s: %s' % (type(error).__name__, error)})
        return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
