#include <atomic>
#include <mutex>
#include <thread>
#include <sstream>
#include <fstream>
#include <filesystem>
#include <sddl.h>
#include <psapi.h>
#include <functional>

static std::wstring wide(const std::string& text){if(text.empty())return L"";int n=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text.data(),(int)text.size(),nullptr,0);if(!n)throw std::runtime_error("Invalid UTF-8");std::wstring result(n,0);MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text.data(),(int)text.size(),result.data(),n);return result;}
static std::string userSid(){HANDLE token;if(!OpenProcessToken(GetCurrentProcess(),TOKEN_QUERY,&token))throw std::runtime_error("Cannot read process owner");DWORD n=0;GetTokenInformation(token,TokenUser,nullptr,0,&n);std::vector<uint8_t> data(n);BOOL ok=GetTokenInformation(token,TokenUser,data.data(),n,&n);CloseHandle(token);if(!ok)throw std::runtime_error("Cannot read process owner");LPWSTR sid;if(!ConvertSidToStringSidW(((TOKEN_USER*)data.data())->User.Sid,&sid))throw std::runtime_error("Cannot read process owner");std::wstring s(sid);LocalFree(sid);return std::string(s.begin(),s.end());}
static std::string propertyString(JSContext* ctx,JSValueConst object,const char* name,const std::string& fallback=""){JSValue value=JS_GetPropertyStr(ctx,object,name);if(JS_IsUndefined(value)||JS_IsNull(value)){JS_FreeValue(ctx,value);return fallback;}const char* text=JS_ToCString(ctx,value);if(!text){JS_FreeValue(ctx,value);throw std::runtime_error(name);}std::string out(text);JS_FreeCString(ctx,text);JS_FreeValue(ctx,value);return out;}
static bool propertyBool(JSContext* ctx,JSValueConst object,const char* name){JSValue value=JS_GetPropertyStr(ctx,object,name);bool out=JS_ToBool(ctx,value);JS_FreeValue(ctx,value);return out;}
class NativeControl {
 std::thread worker;std::atomic<bool> alive{false};std::mutex mutex;std::string status,token,session;std::wstring name;HANDLE pipe=INVALID_HANDLE_VALUE;PSECURITY_DESCRIPTOR security=nullptr;std::function<void(const std::string&)> action;
 void serve(){
  while(alive){BOOL connected=ConnectNamedPipe(pipe,nullptr);if(!connected&&GetLastError()!=ERROR_PIPE_CONNECTED){if(!alive)break;continue;}
   std::string body;const ULONGLONG deadline=GetTickCount64()+1800;
   while(alive&&body.size()<=2048&&GetTickCount64()<deadline){DWORD available=0;if(!PeekNamedPipe(pipe,nullptr,0,nullptr,&available,nullptr))break;if(!available){Sleep(10);continue;}char bytes[2048];DWORD got=0;if(!ReadFile(pipe,bytes,std::min<DWORD>(available,sizeof(bytes)),&got,nullptr)||!got)break;body.append(bytes,got);if(body.find('\n')!=std::string::npos)break;}
   const std::string prefix="{\"token\":\""+token+"\",\"command\":\"";std::string response;
   std::string command;for(const auto* choice:{"stop","pet-dog","pet-cat"})if(body==prefix+choice+"\"}\n")command=choice;
   if(body==prefix+"status\"}\n"){std::lock_guard<std::mutex> lock(mutex);response=status+"\n";}
   else if(!command.empty())response=command=="stop"?"{\"stopped\":true}\n":"{\"accepted\":true}\n";
   if(!response.empty()){DWORD wrote=0;WriteFile(pipe,response.data(),(DWORD)response.size(),&wrote,nullptr);if(!command.empty())action(command);FlushFileBuffers(pipe);}
   DisconnectNamedPipe(pipe);
  }
 }
public:
 void start(const std::string& address,const std::string& secret,const std::string& file,std::function<void(const std::string&)> callback){
  if(secret.size()!=64||secret.find_first_not_of("0123456789abcdef")!=std::string::npos||address.rfind("\\\\.\\pipe\\retrieviewer-overlay-",0)!=0)throw std::runtime_error("Invalid native control configuration");
  token=secret;name=wide(address);session=file;action=callback;std::wstring sddl=wide("D:P(A;;GA;;;"+userSid()+")");if(!ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl.c_str(),SDDL_REVISION_1,&security,nullptr))throw std::runtime_error("Cannot protect native control pipe");SECURITY_ATTRIBUTES attributes{sizeof(SECURITY_ATTRIBUTES),security,FALSE};
  pipe=CreateNamedPipeW(name.c_str(),PIPE_ACCESS_DUPLEX|FILE_FLAG_FIRST_PIPE_INSTANCE,PIPE_TYPE_BYTE|PIPE_READMODE_BYTE|PIPE_WAIT|PIPE_REJECT_REMOTE_CLIENTS,1,8192,4096,0,&attributes);if(pipe==INVALID_HANDLE_VALUE)throw std::runtime_error("Cannot open native control pipe");alive=true;worker=std::thread([this]{serve();});
 }
 void update(const std::string& value){std::lock_guard<std::mutex> lock(mutex);status=value;}
 void close(){if(alive.exchange(false)){if(worker.joinable()){CancelSynchronousIo(worker.native_handle());HANDLE wake=CreateFileW(name.c_str(),GENERIC_READ|GENERIC_WRITE,0,nullptr,OPEN_EXISTING,0,nullptr);if(wake!=INVALID_HANDLE_VALUE)CloseHandle(wake);worker.join();}if(pipe!=INVALID_HANDLE_VALUE){CloseHandle(pipe);pipe=INVALID_HANDLE_VALUE;}}
  if(security){LocalFree(security);security=nullptr;}
  if(!session.empty()){auto path=std::filesystem::u8path(session);DWORD attr=GetFileAttributesW(path.c_str()),parent=GetFileAttributesW(path.parent_path().c_str());if(attr!=INVALID_FILE_ATTRIBUTES&&parent!=INVALID_FILE_ATTRIBUTES&&!(attr&FILE_ATTRIBUTE_REPARSE_POINT)&&!(parent&FILE_ATTRIBUTE_REPARSE_POINT)){std::ifstream file(path,std::ios::binary);std::string bytes((std::istreambuf_iterator<char>(file)),std::istreambuf_iterator<char>());file.close();if(bytes.size()<8192&&bytes.find("\"token\":\""+token+"\"")!=std::string::npos)DeleteFileW(path.c_str());}session.clear();}
 }
 ~NativeControl(){close();}
};
