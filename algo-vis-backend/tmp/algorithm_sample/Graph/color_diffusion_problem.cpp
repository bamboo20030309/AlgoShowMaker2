//color_diffusion_problem Sample
#include <bits/stdc++.h>
#include "AV.hpp"
using namespace std;
AV av;
#define pb push_back
int main() {
    int T; cin>>T;
    string color="NRGYBMCW";
    //draw{
    vector<string> _color={"rgba(55, 55, 55, 0.7)","rgba(255, 45, 45, 0.7)","rgba(102, 250, 102, 0.7)","rgba(250, 250, 69, 0.7)","rgba(63, 120, 253, 0.7)","rgba(241, 87, 216, 0.7)","rgba(58, 221, 250, 0.7)","white"};
    av.start_draw();
    av.start_frame_draw();
    av.colored_text({{{"{題意：}\n這是一個在每個格子塗上顏色 \n並觀察他在過了k天後的擴散情況的模擬問題 \n一開始會給很多原色 {每一天會往上下左右擴散 直到k天結束後 輸出結束狀態}"}}}, -10,-130);
    av.frame_draw("board",0,40,vector<vector<char>>{{'R','N','G'},{'N','N','N'},{'B','N','N'}},{
        {{"background",_color[0]},{{0,1},{1,0},{1,1},{1,2},{2,1},{2,2}}},
        {{"background",_color[1]},{{0,0}}},
        {{"background",_color[2]},{{0,2}}},
        {{"background",_color[3]},{}},
        {{"background",_color[4]},{{2,0}}},
        {{"background",_color[5]},{}},
        {{"background",_color[6]},{}},
        {{"background",_color[7]},{}}
    },{{0,0},{2,2}});
    av.end_frame_draw();
    av.start_frame_draw();
    av.colored_text({{{"{題意：}\n{這是一個在每個格子塗上顏色} \n{並觀察他在過了k天後的擴散情況的模擬問題} \n{一開始會給很多原色} 每一天會往上下左右擴散 {直到k天結束後 輸出結束狀態}"}}}, -10,-130);
    av.frame_draw("board",0,40,vector<vector<char>>{{'R','N','G'},{'N','N','N'},{'B','N','N'}},{
        {{"background",_color[0]},{{1,1},{2,2}}},
        {{"background",_color[1]},{{0,0}}},
        {{"background",_color[2]},{{0,2},{1,2}}},
        {{"background",_color[3]},{{0,1}}},
        {{"background",_color[4]},{{2,0},{2,1}}},
        {{"background",_color[5]},{{1,0}}},
        {{"background",_color[6]},{}},
        {{"background",_color[7]},{}}
    },{{0,0},{2,2}});
    av.end_frame_draw();
    av.start_frame_draw();
    av.colored_text({{{"{題意：}\n{這是一個在每個格子塗上顏色} \n{並觀察他在過了k天後的擴散情況的模擬問題} \n{一開始會給很多原色 每一天會往上下左右擴散} 直到k天結束後 輸出結束狀態"}}}, -10,-130);
    av.frame_draw("board",0,40,vector<vector<char>>{{'R','N','G'},{'N','N','N'},{'B','N','N'}},{
        {{"background",_color[0]},{}},
        {{"background",_color[1]},{}},
        {{"background",_color[2]},{{1,2}}},
        {{"background",_color[3]},{{0,1},{0,2}}},
        {{"background",_color[4]},{{2,1}}},
        {{"background",_color[5]},{{1,0},{2,0}}},
        {{"background",_color[6]},{{2,2}}},
        {{"background",_color[7]},{{0,0},{1,1}}}
    },{{0,0},{2,2}});
    av.end_frame_draw();

    av.start_frame_draw();
    av.colored_text({ {{"{思路：}\n先建立一個顏色對照表來轉換字元與數字\n透過巧妙的陣列編排能夠以 "}},{{"二進制"},"rgba(237, 255, 73, 0.46)"},{{" 的方式直接儲存顏色 \n{將0的位置定義為} "}},{{"{黑色}"},"rgba(55, 55, 55, 0.46)"}}, -10,-130);
    av.frame_draw("color",0,0,AV::string_to_char_array(color),{},{0},"normal", 0,4);
    av.end_frame_draw();

    av.start_frame_draw();
    av.colored_text({ {{"{思路：}\n{先建立一個顏色對照表來轉換字元與數字}\n{透過巧妙的陣列編排能夠以 }"}},{{"{二進制}"},"rgba(237, 255, 73, 0.46)"},{{" {的方式直接儲存顏色} \n將0的位置定義為 "}},{{"黑色"},"rgba(55, 55, 55, 0.46)"}}, -10,-130);
    av.frame_draw("color",0,0,AV::string_to_char_array(color),{
        {{"background",_color[0]},{0}}
    },{0},"normal", 0,4);
    av.end_frame_draw();

    av.start_frame_draw();
    av.colored_text( { 
        {{"再來將原色分別排在 "}},
        {{"1"},"rgba(255, 45, 45, 0.46)"},
        {{" , "}},
        {{"{2}"},"rgba(102, 250, 102, 0.46)"},
        {{"{ , }"}},
        {{"{4}"},"rgba(63, 120, 253, 0.46)"},
        {{"\n{為什麼這樣排?}\n{因為} "}},
        {{"{1}"},"rgba(255, 45, 45, 0.46)"},
        {{"{ , }"}},
        {{"{2}"},"rgba(102, 250, 102, 0.46)"},
        {{"{ , }"}},
        {{"{4}"},"rgba(63, 120, 253, 0.46)"},
        {{"{ 在二進位上分別是 }"}},
        {{"{001}"},"rgba(255, 45, 45, 0.46)"},
        {{"{ , }"}},
        {{"{010}"},"rgba(102, 250, 102, 0.46)"},
        {{"{ , }"}},
        {{"{100}"},"rgba(63, 120, 253, 0.46)"},
        {{"\n{每個 bit 分別代表有沒有那個顏色的意思 }(有是 1 沒有是 0)\n"}},
        {{"{所以}\n"}},
        {{"{001}"},"rgba(255, 45, 45, 0.46)"},
        {{"{ 代表 }"}},
        {{"{沒藍色}"}},
        {{"{ , }"}},
        {{"{沒綠色}"}},
        {{"{ , }"}},
        {{"{有紅色}"},"rgba(255, 45, 45, 0.46)"},
        {{"\n"}},
        {{"{010}"},"rgba(102, 250, 102, 0.46)"},
        {{"{ 代表 }"}},
        {{"{沒藍色}"}},
        {{"{ , }"}},
        {{"{有綠色}"},"rgba(102, 250, 102, 0.46)"},
        {{"{ , }"}},
        {{"{沒紅色}\n"}},
        {{"{100}"},"rgba(63, 120, 253, 0.46)"},
        {{"{ 代表 }"}},
        {{"{有藍色}"},"rgba(63, 120, 253, 0.46)"},
        {{"{ , }"}},
        {{"{沒綠色}"}},
        {{"{ , }"}},
        {{"{沒紅色}"}},
    }, -10,-110);
    av.frame_draw("color",0,110,AV::string_to_char_array(color),{
        {{"background",_color[0]},{0}},
        {{"background",_color[1]},{1}},
        {{"background",_color[2]},{}},
        {{"background",_color[4]},{}}
    },{0},"normal", 0,4);
    av.end_frame_draw();
    av.start_frame_draw();
    av.colored_text( { 
        {{"{再來將原色分別排在} "}},
        {{"{1}"},"rgba(255, 45, 45, 0.46)"},
        {{"{ , }"}},
        {{"2"},"rgba(102, 250, 102, 0.46)"},
        {{" , "}},
        {{"{4}"},"rgba(63, 120, 253, 0.46)"},
        {{"\n{為什麼這樣排?}\n{因為} "}},
        {{"{1}"},"rgba(255, 45, 45, 0.46)"},
        {{"{ , }"}},
        {{"{2}"},"rgba(102, 250, 102, 0.46)"},
        {{"{ , }"}},
        {{"{4}"},"rgba(63, 120, 253, 0.46)"},
        {{"{ 在二進位上分別是 }"}},
        {{"{001}"},"rgba(255, 45, 45, 0.46)"},
        {{"{ , }"}},
        {{"{010}"},"rgba(102, 250, 102, 0.46)"},
        {{"{ , }"}},
        {{"{100}"},"rgba(63, 120, 253, 0.46)"},
        {{"\n{每個 bit 分別代表有沒有那個顏色的意思 }(有是 1 沒有是 0)\n"}},
        {{"{所以}\n"}},
        {{"{001}"},"rgba(255, 45, 45, 0.46)"},
        {{"{ 代表 }"}},
        {{"{沒藍色}"}},
        {{"{ , }"}},
        {{"{沒綠色}"}},
        {{"{ , }"}},
        {{"{有紅色}"},"rgba(255, 45, 45, 0.46)"},
        {{"\n"}},
        {{"{010}"},"rgba(102, 250, 102, 0.46)"},
        {{"{ 代表 }"}},
        {{"{沒藍色}"}},
        {{"{ , }"}},
        {{"{有綠色}"},"rgba(102, 250, 102, 0.46)"},
        {{"{ , }"}},
        {{"{沒紅色}\n"}},
        {{"{100}"},"rgba(63, 120, 253, 0.46)"},
        {{"{ 代表 }"}},
        {{"{有藍色}"},"rgba(63, 120, 253, 0.46)"},
        {{"{ , }"}},
        {{"{沒綠色}"}},
        {{"{ , }"}},
        {{"{沒紅色}"}},
    }, -10,-110);
    av.frame_draw("color",0,110,AV::string_to_char_array(color),{
        {{"background",_color[0]},{0}},
        {{"background",_color[1]},{1}},
        {{"background",_color[2]},{2}},
        {{"background",_color[4]},{}}
    },{0},"normal", 0,4);
    av.end_frame_draw();
    av.start_frame_draw();
    av.colored_text( { 
        {{"{再來將原色分別排在} "}},
        {{"{1}"},"rgba(255, 45, 45, 0.46)"},
        {{"{ , }"}},
        {{"{2}"},"rgba(102, 250, 102, 0.46)"},
        {{"{ , }"}},
        {{"4"},"rgba(63, 120, 253, 0.46)"},
        {{"\n為什麼這樣排?\n因為 "}},
        {{"1"},"rgba(255, 45, 45, 0.46)"},
        {{" , "}},
        {{"2"},"rgba(102, 250, 102, 0.46)"},
        {{" , "}},
        {{"4"},"rgba(63, 120, 253, 0.46)"},
        {{" 在二進位上分別是 "}},
        {{"001"},"rgba(255, 45, 45, 0.46)"},
        {{" , "}},
        {{"010"},"rgba(102, 250, 102, 0.46)"},
        {{" , "}},
        {{"{100:一零零}"},"rgba(63, 120, 253, 0.46)"},
        {{"\n每個 {bit:位元} 分別代表有沒有那個顏色的意思 (有是 1 沒有是 0)\n"}},
        {{"所以\n"}},
        {{"001"},"rgba(255, 45, 45, 0.46)"},
        {{" 代表 "}},
        {{"沒藍色"}},
        {{" , "}},
        {{"沒綠色"}},
        {{" , "}},
        {{"有紅色"},"rgba(255, 45, 45, 0.46)"},
        {{"\n"}},
        {{"010"},"rgba(102, 250, 102, 0.46)"},
        {{" 代表 "}},
        {{"沒藍色"}},
        {{" , "}},
        {{"有綠色"},"rgba(102, 250, 102, 0.46)"},
        {{" , "}},
        {{"沒紅色\n"}},
        {{"{100:一零零}"},"rgba(63, 120, 253, 0.46)"},
        {{" 代表 "}},
        {{"有藍色"},"rgba(63, 120, 253, 0.46)"},
        {{" , "}},
        {{"沒綠色"}},
        {{" , "}},
        {{"沒紅色"}},
    }, -10,-110);
    av.frame_draw("color",0,110,AV::string_to_char_array(color),{
        {{"background",_color[0]},{0}},
        {{"background",_color[1]},{1}},
        {{"background",_color[2]},{2}},
        {{"background",_color[4]},{4}}
    },{0},"normal", 0,4);
    av.end_frame_draw();

    av.start_frame_draw();
    av.colored_text( { 
        {{"而這樣排的好處很自然的就是\n"}},
        {{"011"},"rgba(250, 250, 69, 0.46)"},
        {{" = "}},
        {{"沒藍色"}},
        {{" , "}},
        {{"有綠色"},"rgba(102, 250, 102, 0.46)"},
        {{" , "}},
        {{"有紅色"},"rgba(255, 45, 45, 0.46)"},
        {{" = "}},
        {{"{黃色}"},"rgba(250, 250, 69, 0.46)"},
    }, -10,-130);
    av.frame_draw("color",0,-40,AV::string_to_char_array(color),{
        {{"background",_color[0]},{0}},
        {{"background",_color[1]},{1}},
        {{"background",_color[2]},{2}},
        {{"background",_color[3]},{}},
        {{"background",_color[4]},{4}}
    },{0},"normal", 0,4);
    av.end_frame_draw();
    av.start_frame_draw();
    av.colored_text( { 
        {{"{而這樣排的好處很自然的就是}\n"}},
        {{"{011}"},"rgba(250, 250, 69, 0.46)"},
        {{"{ = }"}},
        {{"{沒藍色}"}},
        {{"{ , }"}},
        {{"{有綠色}"},"rgba(102, 250, 102, 0.46)"},
        {{"{ , }"}},
        {{"{有紅色}"},"rgba(255, 45, 45, 0.46)"},
        {{"{ = }"}},
        {{"黃色"},"rgba(250, 250, 69, 0.46)"},
    }, -10,-130);
    av.frame_draw("color",0,-40,AV::string_to_char_array(color),{
        {{"background",_color[0]},{0}},
        {{"background",_color[1]},{1}},
        {{"background",_color[2]},{2}},
        {{"background",_color[3]},{3}},
        {{"background",_color[4]},{4}}
    },{0},"normal", 0,4);
    av.end_frame_draw();

    av.start_frame_draw();
    av.colored_text( { 
        {{"{100:一零一}"},"rgba(241, 87, 216, 0.46)"},
        {{" = "}},
        {{"有藍色"},"rgba(63, 120, 253, 0.46)"},
        {{" , "}},
        {{"沒綠色"}},
        {{" , "}},
        {{"有紅色"},"rgba(255, 45, 45, 0.46)"},
        {{" = "}},
        {{"{品紅色}"},"rgba(241, 87, 216, 0.46)"},        
    }, -10,-130);
    av.frame_draw("color",0,-60,AV::string_to_char_array(color),{
        {{"background",_color[0]},{0}},
        {{"background",_color[1]},{1}},
        {{"background",_color[2]},{2}},
        {{"background",_color[3]},{3}},
        {{"background",_color[4]},{4}},
        {{"background",_color[5]},{}}
    },{0},"normal", 0,4);
    av.end_frame_draw();
    av.start_frame_draw();
    av.colored_text( { 
        {{"{100}"},"rgba(241, 87, 216, 0.46)"},
        {{"{ = }"}},
        {{"{有藍色}"},"rgba(63, 120, 253, 0.46)"},
        {{"{ , }"}},
        {{"{沒綠色}"}},
        {{"{ , }"}},
        {{"{有紅色}"},"rgba(255, 45, 45, 0.46)"},
        {{"{ = }"}},
        {{"品紅色"},"rgba(241, 87, 216, 0.46)"},        
    }, -10,-130);
    av.frame_draw("color",0,-60,AV::string_to_char_array(color),{
        {{"background",_color[0]},{0}},
        {{"background",_color[1]},{1}},
        {{"background",_color[2]},{2}},
        {{"background",_color[3]},{3}},
        {{"background",_color[4]},{4}},
        {{"background",_color[5]},{5}}
    },{0},"normal", 0,4);
    av.end_frame_draw();

    av.start_frame_draw();
    av.colored_text( { 
        {{"{100:一一零}"},"rgba(58, 221, 250, 0.46)"},
        {{" = "}},
        {{"有藍色"},"rgba(63, 120, 253, 0.46)"},
        {{" , "}},
        {{"有綠色"},"rgba(102, 250, 102, 0.46)"},
        {{" , "}},
        {{"沒紅色"}},
        {{" = "}},
        {{"{青色}"},"rgba(58, 221, 250, 0.46)"},
    }, -10,-130);
    av.frame_draw("color",0,-60,AV::string_to_char_array(color),{
        {{"background",_color[0]},{0}},
        {{"background",_color[1]},{1}},
        {{"background",_color[2]},{2}},
        {{"background",_color[3]},{3}},
        {{"background",_color[4]},{4}},
        {{"background",_color[5]},{5}},
        {{"background",_color[6]},{}}
    },{0},"normal", 0,4);
    av.end_frame_draw();
    av.start_frame_draw();
    av.colored_text( { 
        {{"{100}"},"rgba(58, 221, 250, 0.46)"},
        {{"{ = }"}},
        {{"{有藍色}"},"rgba(63, 120, 253, 0.46)"},
        {{"{ , }"}},
        {{"{有綠色}"},"rgba(102, 250, 102, 0.46)"},
        {{"{ , }"}},
        {{"{沒紅色}"}},
        {{"{ = }"}},
        {{"青色"},"rgba(58, 221, 250, 0.46)"},
    }, -10,-130);
    av.frame_draw("color",0,-60,AV::string_to_char_array(color),{
        {{"background",_color[0]},{0}},
        {{"background",_color[1]},{1}},
        {{"background",_color[2]},{2}},
        {{"background",_color[3]},{3}},
        {{"background",_color[4]},{4}},
        {{"background",_color[5]},{5}},
        {{"background",_color[6]},{6}}
    },{0},"normal", 0,4);
    av.end_frame_draw();

    av.start_frame_draw();
    av.colored_text( { 
        {{"全部都有自然就是\n"}},
        {{"{111:一一一}"},"white"},
        {{" = "}},
        {{"有藍色"},"rgba(63, 120, 253, 0.46)"},
        {{" , "}},
        {{"有綠色"},"rgba(102, 250, 102, 0.46)"},
        {{" , "}},
        {{"有紅色"},"rgba(255, 45, 45, 0.46)"},
        {{" = "}},
        {{"白色"},"white"}
    }, -10,-130);
    av.frame_draw("color",0,-40,AV::string_to_char_array(color),{
        {{"background",_color[0]},{0}},
        {{"background",_color[1]},{1}},
        {{"background",_color[2]},{2}},
        {{"background",_color[3]},{3}},
        {{"background",_color[4]},{4}},
        {{"background",_color[5]},{5}},
        {{"background",_color[6]},{6}},
        {{"background",_color[7]},{7}}
    },{0},"normal", 0,4);
    av.end_frame_draw();
    
    av.start_frame_draw();
    av.colored_text( { 
        {{"這樣子就將顏色表建立完成了\n而接下來計算顏色蔓延也很簡單\n只需要每個格子從周圍的格子去將顏色 "}},
        {{"{or:或}"},"rgba(241, 255, 47, 0.44)"},
        {{" 過來 ({or 的操作符號就是 | ，比如說 }"}},
        {{"{001}"},"rgba(255, 45, 45, 0.46)"},
        {{"{ | }"}},
        {{"{010}"},"rgba(102, 250, 102, 0.46)"},
        {{"{ = }"}},
        {{"{011}"},"rgba(250, 250, 69, 0.46)"},
        {{" )\n這樣只需要一個數字就可以分別完成三個原色的顏色擴散計算"}}
    }, -10,-130);
    av.frame_draw("color",0,0,AV::string_to_char_array(color),{
        {{"background",_color[0]},{0}},
        {{"background",_color[1]},{1}},
        {{"background",_color[2]},{2}},
        {{"background",_color[3]},{3}},
        {{"background",_color[4]},{4}},
        {{"background",_color[5]},{5}},
        {{"background",_color[6]},{6}},
        {{"background",_color[7]},{7}}
    },{0},"normal", 0,4);
    av.key_colored_text( { 
        {{"利用二進制編排建立顏色表"}}
    }, -10,-70);
    av.key_frame_draw("color",0,0,AV::string_to_char_array(color),{
        {{"background",_color[0]},{0}},
        {{"background",_color[1]},{1}},
        {{"background",_color[2]},{2}},
        {{"background",_color[3]},{3}},
        {{"background",_color[4]},{4}},
        {{"background",_color[5]},{5}},
        {{"background",_color[6]},{6}},
        {{"background",_color[7]},{7}}
    },{0},"normal", 0,4);
    av.end_frame_draw();
    //}
    while(T--){
        int n,k; cin>>n>>k; char c;
        vector<vector<int>> board(n+2,vector<int>(n+2));
        for(int i=1;i<=n;i++)for(int j=1;j<=n;j++)cin>>c,board[i][j]=color.find(c);
        //draw{
        vector<vector<char>> _draw_color_char(n+2,vector<char>(n+2));
        for(int i=1;i<=n;i++)for(int j=1;j<=n;j++)_draw_color_char[i][j]=color[board[i][j]];
        vector<vector<pair<int,int>>> _draw_color(8);
        for(int i=1;i<=n;i++)for(int j=1;j<=n;j++)_draw_color[board[i][j]].pb({i,j});
        av.start_frame_draw();
        av.colored_text({
            {{"這是輸入的初始狀態也就是 {char:character} 的形式"}}
        },0,40);
        av.frame_draw("color",0,-80,AV::string_to_char_array(color),{
            {{"background",_color[0]},{0}},
            {{"background",_color[1]},{1}},
            {{"background",_color[2]},{2}},
            {{"background",_color[3]},{3}},
            {{"background",_color[4]},{4}},
            {{"background",_color[5]},{5}},
            {{"background",_color[6]},{6}},
            {{"background",_color[7]},{7}}
        },{0},"normal", 0,4);
        av.frame_draw("board",0,120,_draw_color_char,{
            {{"background",_color[0]},_draw_color[0]},
            {{"background",_color[1]},_draw_color[1]},
            {{"background",_color[2]},_draw_color[2]},
            {{"background",_color[3]},_draw_color[3]},
            {{"background",_color[4]},_draw_color[4]},
            {{"background",_color[5]},_draw_color[5]},
            {{"background",_color[6]},_draw_color[6]},
            {{"background",_color[7]},_draw_color[7]}
        },{{1,1},{n,n}});
        av.end_frame_draw();

        vector<vector<string>> _draw_board_bit(n+2,vector<string>(n+2));
        for(int i=1;i<=n;i++)for(int j=1;j<=n;j++)_draw_board_bit[i][j]=to_string(board[i][j]>>2&1)+to_string(board[i][j]>>1&1)+to_string(board[i][j]&1);
        _draw_color = vector<vector<pair<int,int>>>(8);
        for(int i=1;i<=n;i++)for(int j=1;j<=n;j++)_draw_color[board[i][j]].pb({i,j});
        av.start_frame_draw();
        av.colored_text({
            {{"透過 {color:顏色}表 將顏色轉成數字 { color.find(n) }"}}
        },0,40);
        av.frame_draw("color",0,-80,AV::string_to_char_array(color),{
            {{"background",_color[0]},{0}},
            {{"background",_color[1]},{1}},
            {{"background",_color[2]},{2}},
            {{"background",_color[3]},{3}},
            {{"background",_color[4]},{4}},
            {{"background",_color[5]},{5}},
            {{"background",_color[6]},{6}},
            {{"background",_color[7]},{7}}
        },{0},"normal", 0,4);
        av.frame_draw("board",0,120,_draw_board_bit,{
            {{"background",_color[0]},_draw_color[0]},
            {{"background",_color[1]},_draw_color[1]},
            {{"background",_color[2]},_draw_color[2]},
            {{"background",_color[3]},_draw_color[3]},
            {{"background",_color[4]},_draw_color[4]},
            {{"background",_color[5]},_draw_color[5]},
            {{"background",_color[6]},_draw_color[6]},
            {{"background",_color[7]},_draw_color[7]}
        },{{1,1},{n,n}});
        av.end_frame_draw();

        av.start_frame_draw();
        av.text("接{著:ㄓㄜ˙}是最關鍵的地方\n開一個新表來記錄下一輪的變化狀況",0,20);
        av.frame_draw("board",0,120,_draw_board_bit,{
            {{"background",_color[0]},_draw_color[0]},
            {{"background",_color[1]},_draw_color[1]},
            {{"background",_color[2]},_draw_color[2]},
            {{"background",_color[3]},_draw_color[3]},
            {{"background",_color[4]},_draw_color[4]},
            {{"background",_color[5]},_draw_color[5]},
            {{"background",_color[6]},_draw_color[6]},
            {{"background",_color[7]},_draw_color[7]}
        },{{1,1},{n,n}});
        av.frame_draw("new_board",200,120,vector<vector<string>> (n+2,vector<string>(n+2,"000")),{
            {{"background",_color[0]},AV::AtoB(1,1,n,n)}
        },{{1,1},{n,n}});
        av.end_frame_draw();
        //}
        for(int t=0;t<k;t++){
            vector<vector<int>> new_board(n+2,vector<int>(n+2));
            //draw{
            int _k=0;
            //}
            for(int i=1;i<=n;i++)for(int j=1;j<=n;j++){
                new_board[i-1][j  ]|=board[i][j];
                new_board[i  ][j-1]|=board[i][j];
                new_board[i+1][j  ]|=board[i][j];
                new_board[i  ][j+1]|=board[i][j];
                new_board[i  ][j  ]|=board[i][j];
                //draw{
                vector<vector<string>> _draw_board_bit(n+2,vector<string>(n+2)),_draw_new_board_bit(n+2,vector<string>(n+2));
                for(int i=1;i<=n;i++)for(int j=1;j<=n;j++)_draw_board_bit[i][j]=to_string(board[i][j]>>2&1)+to_string(board[i][j]>>1&1)+to_string(board[i][j]&1);
                for(int i=1;i<=n;i++)for(int j=1;j<=n;j++)_draw_new_board_bit[i][j]=to_string(new_board[i][j]>>2&1)+to_string(new_board[i][j]>>1&1)+to_string(new_board[i][j]&1);
                _draw_color = vector<vector<pair<int,int>>>(8);
                vector<vector<pair<int,int>>> _draw_new_board_color(8);
                for(int i=1;i<=n;i++)for(int j=1;j<=n;j++)_draw_color[board[i][j]].pb({i,j});
                for(int i=1;i<=n;i++)for(int j=1;j<=n;j++)_draw_new_board_color[new_board[i][j]].pb({i,j});
                av.start_frame_draw();
                if(_k<1 && t>0)av.text("開啟新的一天的擴散計算",0,40);
                else if(_k<1)  av.text("從原來的 {board:舊陣列} 將十字的部分全部 {or:或} 過來 儲存在 {new_board:新陣列}\n邊界可以透過填補一圈0 簡單解決",0,20);
                else           av.text("{利用 or 計算}擴散{部分}",0,40);
                _k++;
                av.frame_draw("board",0,120,_draw_board_bit,{
                    {{"background",_color[0]},_draw_color[0]},
                    {{"background",_color[1]},_draw_color[1]},
                    {{"background",_color[2]},_draw_color[2]},
                    {{"background",_color[3]},_draw_color[3]},
                    {{"background",_color[4]},_draw_color[4]},
                    {{"background",_color[5]},_draw_color[5]},
                    {{"background",_color[6]},_draw_color[6]},
                    {{"background",_color[7]},_draw_color[7]},
                    {{"highlight"},{{i,j}}}
                },{{1,1},{n,n}});
                av.frame_draw("new_board",200,120,_draw_new_board_bit,{
                    {{"background",_color[0]},_draw_new_board_color[0]},
                    {{"background",_color[1]},_draw_new_board_color[1]},
                    {{"background",_color[2]},_draw_new_board_color[2]},
                    {{"background",_color[3]},_draw_new_board_color[3]},
                    {{"background",_color[4]},_draw_new_board_color[4]},
                    {{"background",_color[5]},_draw_new_board_color[5]},
                    {{"background",_color[6]},_draw_new_board_color[6]},
                    {{"background",_color[7]},_draw_new_board_color[7]},
                    {{"highlight"},{{i,j},{i,j-1},{i-1,j},{i,j+1},{i+1,j}}}
                },{{1,1},{n,n}});
                av.end_frame_draw();
                //}
            }
            board = move(new_board);
            //draw{
            vector<vector<string>> _draw_board_bit(n+2,vector<string>(n+2));
            for(int i=1;i<=n;i++)for(int j=1;j<=n;j++)_draw_board_bit[i][j]=to_string(board[i][j]>>2&1)+to_string(board[i][j]>>1&1)+to_string(board[i][j]&1);
            _draw_color = vector<vector<pair<int,int>>>(8);
            for(int i=1;i<=n;i++)for(int j=1;j<=n;j++)_draw_color[board[i][j]].pb({i,j});
            av.start_frame_draw();
            if(t==0)av.text("計算完一天後將 {new_board:新陣列} 取代 {board:舊陣列}\n({注意如果直接 board=new_board}\n{ 他會去抄一個複製本給 board}\n{ 並不是常數時間的}\n{ 所以請用 board=move(new_board)}\n{ 他會直接轉移名字})",0,-50);
            else    av.text("{計算完一天後將} {new_board:新陣列} 取代 {board:舊陣列}\n({注意如果直接 board=new_board}\n{ 他會去抄一個複製本給 board}\n{ 並不是常數時間的}\n{ 所以請用 board=move(new_board)}\n{ 他會直接轉移名字})",0,-50);
            av.frame_draw("board",0,120,_draw_board_bit,{
                {{"background",_color[0]},_draw_color[0]},
                {{"background",_color[1]},_draw_color[1]},
                {{"background",_color[2]},_draw_color[2]},
                {{"background",_color[3]},_draw_color[3]},
                {{"background",_color[4]},_draw_color[4]},
                {{"background",_color[5]},_draw_color[5]},
                {{"background",_color[6]},_draw_color[6]},
                {{"background",_color[7]},_draw_color[7]}
            },{{1,1},{n,n}});
            av.key_text("第" + to_string(t+1) + "天的擴散情況",0,40);
            av.key_frame_draw("board",0,120,_draw_board_bit,{
                {{"background",_color[0]},_draw_color[0]},
                {{"background",_color[1]},_draw_color[1]},
                {{"background",_color[2]},_draw_color[2]},
                {{"background",_color[3]},_draw_color[3]},
                {{"background",_color[4]},_draw_color[4]},
                {{"background",_color[5]},_draw_color[5]},
                {{"background",_color[6]},_draw_color[6]},
                {{"background",_color[7]},_draw_color[7]}
            },{{1,1},{n,n}});
            av.end_frame_draw();
            //}
        }
        for(int i=1;i<=n;i++,cout<<endl)for(int j=1;j<=n;j++)cout<<color[board[i][j]];
        //draw{
        for(int i=1;i<=n;i++)for(int j=1;j<=n;j++)_draw_color_char[i][j]=color[board[i][j]];
        _draw_color = vector<vector<pair<int,int>>>(8);
        for(int i=1;i<=n;i++)for(int j=1;j<=n;j++)_draw_color[board[i][j]].pb({i,j});
        av.start_frame_draw();
        av.text("最後利用 {color:顏色}表 再將數字轉回 {char:character} 的形式輸出",0,40);
        av.frame_draw("color",0,-80,AV::string_to_char_array(color),{
            {{"background",_color[0]},{0}},
            {{"background",_color[1]},{1}},
            {{"background",_color[2]},{2}},
            {{"background",_color[3]},{3}},
            {{"background",_color[4]},{4}},
            {{"background",_color[5]},{5}},
            {{"background",_color[6]},{6}},
            {{"background",_color[7]},{7}}
        },{0},"normal", 0,4);
        av.frame_draw("board",0,120,_draw_color_char,{
            {{"background",_color[0]},_draw_color[0]},
            {{"background",_color[1]},_draw_color[1]},
            {{"background",_color[2]},_draw_color[2]},
            {{"background",_color[3]},_draw_color[3]},
            {{"background",_color[4]},_draw_color[4]},
            {{"background",_color[5]},_draw_color[5]},
            {{"background",_color[6]},_draw_color[6]},
            {{"background",_color[7]},_draw_color[7]}
        },{{1,1},{n,n}});
        av.key_text("最後利用 {color:顏色}表 再將數字轉回 {char:character} 的形式輸出",0,40);
        av.key_frame_draw("color",0,-80,AV::string_to_char_array(color),{
            {{"background",_color[0]},{0}},
            {{"background",_color[1]},{1}},
            {{"background",_color[2]},{2}},
            {{"background",_color[3]},{3}},
            {{"background",_color[4]},{4}},
            {{"background",_color[5]},{5}},
            {{"background",_color[6]},{6}},
            {{"background",_color[7]},{7}}
        },{0},"normal", 0,4);
        av.key_frame_draw("board",0,120,_draw_color_char,{
            {{"background",_color[0]},_draw_color[0]},
            {{"background",_color[1]},_draw_color[1]},
            {{"background",_color[2]},_draw_color[2]},
            {{"background",_color[3]},_draw_color[3]},
            {{"background",_color[4]},_draw_color[4]},
            {{"background",_color[5]},_draw_color[5]},
            {{"background",_color[6]},_draw_color[6]},
            {{"background",_color[7]},_draw_color[7]}
        },{{1,1},{n,n}});
        av.end_frame_draw();
        //}
    }
    //draw{
    av.end_draw();
    //}
    return 0;
}
/*
sample input
1
3 2
RNG
NNN
BNN
*/