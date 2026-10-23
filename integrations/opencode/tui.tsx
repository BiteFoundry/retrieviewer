/** @jsxImportSource @opentui/solid */
// OpenCode v2 TUI plugin: the Retrieviewer pet drawn inside OpenCode's own UI (home
// footer and session composer slots). The host resolves @opencode/plugin/tui,
// @opentui/solid and solid-js and compiles this file; no production dependency here.
// All lifecycle lives in ./runtime.mjs, which loads nothing until a view mounts.
import {Plugin} from '@opencode/plugin/tui';
import {useTerminalDimensions} from '@opentui/solid';
import {createEffect, createSignal, onCleanup, Show} from 'solid-js';
import {createOpenCodePetController} from './runtime.mjs';

export default Plugin.define({
 id:'retrieviewer.pet',
 setup(context){
  const toast=(message,variant='info')=>context.ui.toast.show({title:'Retrieviewer',message,variant});
  const pet=createOpenCodePetController({
   hostVersion:context.app?.version??'unknown',
   onError:error=>toast(String(error?.message??error),'error'),
  });

  // One view per mounted slot; all share the single pet core in the controller.
  function PetView(){
   const dimensions=useTerminalDimensions();
   const [text,setText]=createSignal('');
   const view=pet.attach({
    getViewport:()=>{const {width,height}=dimensions();return {width,height};},
    render:value=>setText(value),
   });
   createEffect(()=>{dimensions();view.refresh();});
   onCleanup(()=>view.detach());
   return (
    <Show when={text()}>
     <box flexShrink={0} paddingLeft={2}>
      <text wrapMode="none" fg={context.theme.text.base}>{text()}</text>
     </box>
    </Show>
   );
  }

  context.ui.slot({append:'home.footer',render:()=><PetView/>});
  context.ui.slot({append:'session.composer.top',render:()=><PetView/>});
  context.keymap.layer(()=>({
   mode:'global',
   commands:[{
    id:'retrieviewer.pet',
    title:'Retrieviewer pet',
    description:'enable | disable | ball | treat | tug | status',
    group:'Retrieviewer',
    palette:true,
    slash:{name:'retrieviewer',arguments:true},
    async run(argument){
     try{toast(await pet.command(argument));}
     catch(error){toast(String(error?.message??error),'error');}
    },
   }],
  }));

  return ()=>pet.dispose();
 },
});
