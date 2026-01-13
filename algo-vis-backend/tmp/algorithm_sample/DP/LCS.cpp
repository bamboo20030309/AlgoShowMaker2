//LCS Sample
#include <bits/stdc++.h>
#include <stack>
#include <set>
#include "AV.hpp"
using namespace std;
#define f first
#define s second
AV av;

string S,T;
vector<vector<int>> LCS;
set<string> ans;
//draw{
vector<pair<pair<int,int>,pair<int,int>>> _draw_LCS_path;
stack<pair<pair<int,int>,pair<int,int>>> _draw_stack_path;
vector<vector<string>> _draw_LCS;
//}

void dfs(int x,int y,string now) {
    if(now.size()==LCS[S.size()][T.size()]){
        ans.insert(now); 
        //draw{
        av.start_frame_draw();
        av.text("如果儲存下來的字串跟LCS長度相同，那就算找到ㄧ組解了，把答案儲存下來",0,120);
        av.frame_draw("LCS",0,200,_draw_LCS,{
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)},
            {{"background","rgba(50, 191, 87, 0.7)"},{{x+1,0},{0,y+1}}},
            {{"CDVS"},AV::AtoB(1,1,S.size()+1,T.size()+1)},
            {{"highlight"},{{x+1,y+1}}}
        });
        av.frame_draw("ans",0,20,AV::to_vector(ans));
        for(auto&v:_draw_LCS_path)av.arrow(AV::relPos_to_absPos("LCS", v.f.f, v.f.s), AV::relPos_to_absPos("LCS", v.s.f, v.s.s));
        for(auto&v:AV::to_vector(_draw_stack_path))av.arrow(AV::relPos_to_absPos("LCS", v.f.f, v.f.s), AV::relPos_to_absPos("LCS", v.s.f, v.s.s), {{"color","rgba(55, 210, 97, 1)"}});
        av.key_text("如果儲存下來的字串跟LCS長度相同，那就算找到ㄧ組解了，把答案儲存下來",0,120);
        av.key_frame_draw("LCS",0,200,_draw_LCS,{
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)},
            {{"background","rgba(50, 191, 87, 0.7)"},{{x+1,0},{0,y+1}}},
            {{"CDVS"},AV::AtoB(1,1,S.size()+1,T.size()+1)},
            {{"highlight"},{{x+1,y+1}}}
        });
        av.key_frame_draw("ans",0,20,AV::to_vector(ans));
        for(auto&v:_draw_LCS_path)av.key_arrow(AV::relPos_to_absPos("LCS", v.f.f, v.f.s), AV::relPos_to_absPos("LCS", v.s.f, v.s.s));
        for(auto&v:AV::to_vector(_draw_stack_path))av.key_arrow(AV::relPos_to_absPos("LCS", v.f.f, v.f.s), AV::relPos_to_absPos("LCS", v.s.f, v.s.s), {{"color","rgba(55, 210, 97, 1)"}});
        av.end_frame_draw();
        //}
        return;
    }
    if(x==0||y==0)return;
    if(S[x-1]==T[y-1]){
        //draw{
        av.start_frame_draw();
        av.colored_text({{{"遇到字元 "}},{{"相同"},"rgba(50, 191, 87, 0.7)"},{{" 那就直接走左上(橋)"}}},0,120);
        av.frame_draw("LCS",0,200,_draw_LCS,{
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)},
            {{"background","rgba(50, 191, 87, 0.7)"},{{x+1,0},{0,y+1}}},
            {{"CDVS"},AV::AtoB(1,1,S.size()+1,T.size()+1)},
            {{"highlight"},{{x+1,y+1}}}
        });
        for(auto&v:_draw_LCS_path)av.arrow(AV::relPos_to_absPos("LCS", v.f.f, v.f.s), AV::relPos_to_absPos("LCS", v.s.f, v.s.s));
        _draw_stack_path.push( {{x,y},{x-1,y-1}} );
        for(auto&v:AV::to_vector(_draw_stack_path))av.arrow(AV::relPos_to_absPos("LCS", v.f.f, v.f.s), AV::relPos_to_absPos("LCS", v.s.f, v.s.s), {{"color","rgba(55, 210, 97, 1)"}});
        av.end_frame_draw();
        //}
        dfs(x-1, y-1, now+S[x-1]);
        //draw{
        _draw_stack_path.pop();
        //}
    } else if(LCS[x-1][y]==LCS[x][y-1]){
        //draw{
        av.start_frame_draw();
        av.colored_text({{{"字元 "}},{{"不相同"},"rgba(254, 62, 62, 0.46)"},{{" 並且左上都ㄧ樣大\n那麼這時候dfs就會分叉成兩條路\n先往上走"}}},0,80);
        av.frame_draw("LCS",0,200,_draw_LCS,{
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)},
            {{"background","rgba(254, 62, 62, 0.7)"},{{x+1,0},{0,y+1}}},
            {{"CDVS"},AV::AtoB(1,1,S.size()+1,T.size()+1)},
            {{"highlight"},{{x+1,y+1}}}
        });
        for(auto&v:_draw_LCS_path)av.arrow(AV::relPos_to_absPos("LCS", v.f.f, v.f.s), AV::relPos_to_absPos("LCS", v.s.f, v.s.s));
        _draw_stack_path.push( {{x,y},{x-1,y}} );
        _draw_stack_path.push( {{x,y},{x,y-1}} );
        for(auto&v:AV::to_vector(_draw_stack_path))av.arrow(AV::relPos_to_absPos("LCS", v.f.f, v.f.s), AV::relPos_to_absPos("LCS", v.s.f, v.s.s), {{"color","rgba(55, 210, 97, 1)"}});
        av.end_frame_draw();
        //}
        dfs(x-1, y, now);
        //draw{
        av.start_frame_draw();
        av.colored_text({{{"回到剛剛的遞迴 這次往左走"}}},0,120);
        av.frame_draw("LCS",0,200,_draw_LCS,{
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)},
            {{"background","rgba(254, 62, 62, 0.7)"},{{x+1,0},{0,y+1}}},
            {{"CDVS"},AV::AtoB(1,1,S.size()+1,T.size()+1)},
            {{"highlight"},{{x+1,y+1}}}
        });
        for(auto&v:_draw_LCS_path)av.arrow(AV::relPos_to_absPos("LCS", v.f.f, v.f.s), AV::relPos_to_absPos("LCS", v.s.f, v.s.s));
        for(auto&v:AV::to_vector(_draw_stack_path))av.arrow(AV::relPos_to_absPos("LCS", v.f.f, v.f.s), AV::relPos_to_absPos("LCS", v.s.f, v.s.s), {{"color","rgba(55, 210, 97, 1)"}});
        av.end_frame_draw();
        //} 
        dfs(x, y-1, now);
        //draw{
        _draw_stack_path.pop();
        _draw_stack_path.pop();
        //}
    } else if(LCS[x-1][y]>LCS[x][y-1]) {
        //draw{
        av.start_frame_draw();
        av.colored_text({{{"字元 "}},{{"不相同"},"rgba(254, 62, 62, 0.46)"},{{" 那就{挑:ㄊㄧㄠ}大的走 這邊往上走"}}},0,120);
        av.frame_draw("LCS",0,200,_draw_LCS,{
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)},
            {{"background","rgba(254, 62, 62, 0.7)"},{{x+1,0},{0,y+1}}},
            {{"CDVS"},AV::AtoB(1,1,S.size()+1,T.size()+1)},
            {{"highlight"},{{x+1,y+1}}}
        });
        for(auto&v:_draw_LCS_path)av.arrow(AV::relPos_to_absPos("LCS", v.f.f, v.f.s), AV::relPos_to_absPos("LCS", v.s.f, v.s.s));
        _draw_stack_path.push( {{x,y},{x-1,y}} );
        for(auto&v:AV::to_vector(_draw_stack_path))av.arrow(AV::relPos_to_absPos("LCS", v.f.f, v.f.s), AV::relPos_to_absPos("LCS", v.s.f, v.s.s), {{"color","rgba(55, 210, 97, 1)"}});
        av.end_frame_draw();
        //}
        dfs(x-1, y, now);
        //draw{
        _draw_stack_path.pop();
        //}
    } else {  
        //draw{
        av.start_frame_draw();
        av.colored_text({{{"字元 "}},{{"不相同"},"rgba(254, 62, 62, 0.46)"},{{" 那就{挑:ㄊㄧㄠ}大的走 這邊往左走"}}},0,120);
        av.frame_draw("LCS",0,200,_draw_LCS,{
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)},
            {{"background","rgba(254, 62, 62, 0.7)"},{{x+1,0},{0,y+1}}},
            {{"CDVS"},AV::AtoB(1,1,S.size()+1,T.size()+1)},
            {{"highlight"},{{x+1,y+1}}}
        });
        for(auto&v:_draw_LCS_path)av.arrow(AV::relPos_to_absPos("LCS", v.f.f, v.f.s), AV::relPos_to_absPos("LCS", v.s.f, v.s.s));
        _draw_stack_path.push( {{x,y},{x,y-1}} );
        for(auto&v:AV::to_vector(_draw_stack_path))av.arrow(AV::relPos_to_absPos("LCS", v.f.f, v.f.s), AV::relPos_to_absPos("LCS", v.s.f, v.s.s), {{"color","rgba(55, 210, 97, 1)"}});
        av.end_frame_draw();
        //}                         
        dfs(x, y-1, now);
        //draw{
        _draw_stack_path.pop();
        //}
    }
}

int main() {
    
    //draw{
    av.start_draw();
    //}
    while(getline(cin,S) && getline(cin,T)){
        LCS.assign(S.size()+1,vector<int>(T.size()+1));
        //draw{
        av.start_frame_draw();
        _draw_LCS.assign(S.size()+2,vector<string>(T.size()+2));
        
        for(int i=1;i<=S.size();i++)_draw_LCS[i+1][0]=S[i-1];
        for(int i=1;i<=T.size();i++)_draw_LCS[0][i+1]=T[i-1];
        for(int I=0;I<=S.size();I++)for(int J=0;J<=T.size();J++)_draw_LCS[I+1][J+1]=to_string(LCS[I][J]);
        av.colored_text({ {{"這是 LCS 的{演算法視覺化}範例\nLongest Common Subsequence 最長共同子序列 簡稱 LCS\n目的是為了找出兩個字串之間相同且最長的子序列 (子序列可以不連續)"}} },0,80);
        av.frame_draw("LCS",0,200,_draw_LCS,{
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)}
        });
        av.key_frame_draw("LCS",0,200,_draw_LCS,{
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)}
        });
        av.end_frame_draw();
        if(S=="abcdedcba" && T=="edcbabcde"){
            vector<vector<int>> _LCS(S.size()+1,vector<int>(T.size()+1));
            vector<vector<string>> _draw_LCS_tmp(S.size()+2,vector<string>(T.size()+2));
            bool _break=false;
            for(int i=1;i<=S.size();i++){
                for(int j=1;j<=T.size();j++){
                    if(_break)break;
                    if(i==3 && j==7)_break=true;
                    if(S[i-1]==T[j-1])_LCS[i][j]=_LCS[i-1][j-1]+1;
                    else              _LCS[i][j]=max(_LCS[i][j-1],_LCS[i-1][j]);
                }
                if(_break)break;
            }
            for(int i=1;i<=S.size();i++)_draw_LCS_tmp[i+1][0]=S[i-1];
            for(int i=1;i<=T.size();i++)_draw_LCS_tmp[0][i+1]=T[i-1];
            for(int I=0;I<=S.size();I++)for(int J=0;J<=T.size();J++)_draw_LCS_tmp[I+1][J+1]=to_string(_LCS[I][J]);
            av.start_frame_draw();
            av.colored_text({ 
                {{"ㄧ般來說 LCS 的 DP 會寫成底下這樣的形式\n每ㄧ個格子代表當前的字串前綴的 LCS 數值\n比如說底下第4列第8行的格子就代表 "}},
                {{"{" + T.substr(0,7) + ":上字串}"},"rgba(254, 238, 62, 0.46)"},
                {{" 和 "}},
                {{"{" + S.substr(0,3) + ":下字串}"},"rgba(254, 238, 62, 0.46)"},
                {{" 的 LCS 值"}}
            },0,80);
            av.frame_draw("LCS",0,200,_draw_LCS_tmp,{
                {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
                {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)},
                {{"background","rgba(254, 238, 62, 0.7)"},AV::AtoB(0,1,0,8)},
                {{"background","rgba(254, 238, 62, 0.7)"},AV::AtoB(1,0,4,0)},
                {{"highlight"},{{4,8}}}
            });
            av.end_frame_draw();
        }
        if(S=="abcdedcba" && T=="edcbabcde"){
            vector<vector<int>> _LCS(S.size()+1,vector<int>(T.size()+1));
            vector<vector<string>> _draw_LCS_tmp(S.size()+2,vector<string>(T.size()+2));
            bool _break=false;
            for(int i=1;i<=S.size();i++){
                for(int j=1;j<=T.size();j++){
                    if(i==4 && j==8)_break=true;
                    if(_break)break;
                    if(S[i-1]==T[j-1])_LCS[i][j]=_LCS[i-1][j-1]+1;
                    else              _LCS[i][j]=max(_LCS[i][j-1],_LCS[i-1][j]);
                }
                if(_break)break;
            }
            for(int i=1;i<=S.size();i++)_draw_LCS_tmp[i+1][0]=S[i-1];
            for(int i=1;i<=T.size();i++)_draw_LCS_tmp[0][i+1]=T[i-1];
            for(int I=0;I<=S.size();I++)for(int J=0;J<=T.size();J++)_draw_LCS_tmp[I+1][J+1]=to_string(_LCS[I][J]);
            _draw_LCS_tmp[5][9]=_draw_LCS_tmp[4][8] + "+1";
            av.start_frame_draw();
            av.colored_text({ 
                {{"假設要計算 "}},
                {{"{" + T.substr(0,7) + ":上字串 加依 }"},"rgba(254, 238, 62, 0.46)"},
                {{" "}},
                {{"{" + T.substr(7,1) + "}"},"rgba(50, 191, 87, 0.46)"},
                {{" 和 "}},
                {{"{" + S.substr(0,3) + ":下字串 加依 }"},"rgba(254, 238, 62, 0.46)"},
                {{" "}},
                {{"{" + S.substr(3,1) + "}"},"rgba(50, 191, 87, 0.46)"},
                {{" 的 LCS\n剛好因為新加入的字元是 "}},
                {{"{ㄧ:宜}樣的"},"rgba(50, 191, 87, 0.46)"},
                {{"\n那就可以直接去取剛剛算過的 "}},
                {{"{" + T.substr(0,7) + ":上字串}"},"rgba(254, 238, 62, 0.46)"},
                {{" 和 "}},
                {{"{" + S.substr(0,3) + ":下字串}"},"rgba(254, 238, 62, 0.46)"},
                {{" 的 LCS 值 再加上 1 就是現在的 LCS 值"}},
            },0,80);
            av.frame_draw("LCS",0,200,_draw_LCS_tmp,{
                {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
                {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)},
                {{"background","rgba(254, 238, 62, 0.7)"},AV::AtoB(0,1,0,8)},
                {{"background","rgba(254, 238, 62, 0.7)"},AV::AtoB(1,0,4,0)},
                {{"background","rgba(50, 191, 87, 0.7)"},{{0,9}}},
                {{"background","rgba(50, 191, 87, 0.7)"},{{5,0}}},
                {{"highlight"},{{5,9}}}
            });
            av.arrow(AV::relPos_to_absPos("LCS",3,7), AV::relPos_to_absPos("LCS",4,8), { {"color","rgba(50, 191, 87, 0.7)"} });
            av.end_frame_draw();
        }
        if(S=="abcdedcba" && T=="edcbabcde"){
            vector<vector<int>> _LCS(S.size()+1,vector<int>(T.size()+1));
            vector<vector<string>> _draw_LCS_tmp(S.size()+2,vector<string>(T.size()+2));
            bool _break=false;
            for(int i=1;i<=S.size();i++){
                for(int j=1;j<=T.size();j++){
                    if(_break)break;
                    if(i==4 && j==9)_break=true;
                    if(S[i-1]==T[j-1])_LCS[i][j]=_LCS[i-1][j-1]+1;
                    else              _LCS[i][j]=max(_LCS[i][j-1],_LCS[i-1][j]);
                }
                if(_break)break;
            }
            for(int i=1;i<=S.size();i++)_draw_LCS_tmp[i+1][0]=S[i-1];
            for(int i=1;i<=T.size();i++)_draw_LCS_tmp[0][i+1]=T[i-1];
            for(int I=0;I<=S.size();I++)for(int J=0;J<=T.size();J++)_draw_LCS_tmp[I+1][J+1]=to_string(_LCS[I][J]);
            av.start_frame_draw();
            av.colored_text({ 
                {{"假設要計算 "}},
                {{"{" + T.substr(0,8) + ":上字串 加依 }"},"rgba(254, 238, 62, 0.46)"},
                {{" "}},
                {{"{" + T.substr(8,1) + "}"},"rgba(254, 62, 62, 0.46)"},
                {{" 和 "}},
                {{"{" + S.substr(0,3) + ":下字串 加依 }"},"rgba(254, 238, 62, 0.46)"},
                {{" "}},
                {{"{" + S.substr(3,1) + "}"},"rgba(254, 62, 62, 0.46)"},
                {{" 的 LCS\n因為新加入的字元是 "}},
                {{"{不一:部宜}樣的"},"rgba(254, 62, 62, 0.46)"},
                {{"\n那就必須要去找 "}},
                {{"{" + T.substr(0,8) + ":上字串}"},"rgba(254, 238, 62, 0.46)"},
                {{"{ , }"}},
                {{"{" + S.substr(0,3) + ":下字串 加依 }"},"rgba(254, 238, 62, 0.46)"},
                {{" "}},
                {{"{" + S.substr(3,1) + "}"},"rgba(254, 62, 62, 0.46)"},
                {{"{ 與 :，與，}"}},
                {{"{" + T.substr(0,8) + ":上字串 加依 }"},"rgba(254, 238, 62, 0.46)"},
                {{" "}},
                {{"{" + T.substr(8,1) + "}"},"rgba(254, 62, 62, 0.46)"},
                {{"{ , }"}},
                {{"{" + S.substr(0,3) + ":下字串}"},"rgba(254, 238, 62, 0.46)"},
                {{" 的最大值才是現在的 LCS 值"}},
            },0,80);
            av.frame_draw("LCS",0,200,_draw_LCS_tmp,{
                {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
                {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)},
                {{"background","rgba(254, 238, 62, 0.7)"},AV::AtoB(0,1,0,9)},
                {{"background","rgba(254, 238, 62, 0.7)"},AV::AtoB(1,0,4,0)},
                {{"background","rgba(254, 62, 62, 0.7)"},{{0,10}}},
                {{"background","rgba(254, 62, 62, 0.7)"},{{5,0}}},
                {{"highlight"},{{5,10}}}
            });
            if(_LCS[3][9]>=_LCS[4][8]) {
                av.arrow(AV::relPos_to_absPos("LCS",3,9), AV::relPos_to_absPos("LCS",4,9), { {"color","rgba(50, 191, 87, 0.7)"} });
                av.arrow(AV::relPos_to_absPos("LCS",4,8), AV::relPos_to_absPos("LCS",4,9));
            } else {
                av.arrow(AV::relPos_to_absPos("LCS",3,9), AV::relPos_to_absPos("LCS",4,9));
                av.arrow(AV::relPos_to_absPos("LCS",4,8), AV::relPos_to_absPos("LCS",4,9), { {"color","rgba(50, 191, 87, 0.7)"} });
            }
            av.end_frame_draw();
        }
        av.start_frame_draw();
        av.colored_text({ {{"接著展示流程"}} },0,120);
        av.frame_draw("LCS",0,200,_draw_LCS,{
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)}
        });
        av.key_colored_text({ {{"接著展示流程"}} },0,120);
        av.key_frame_draw("LCS",0,200,_draw_LCS,{
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)}
        });
        av.end_frame_draw();
        //}

        for(int i=1;i<=S.size();i++)for(int j=1;j<=T.size();j++){
            
            if(S[i-1]==T[j-1])LCS[i][j]=LCS[i-1][j-1]+1;
            else              LCS[i][j]=max(LCS[i][j-1],LCS[i-1][j]);

            //draw{
            if(S[i-1]==T[j-1])_draw_LCS_path.push_back( {{i,j},{i-1,j-1}} );

            if(i==3) av.faston();
            for(int I=0;I<=S.size();I++)for(int J=0;J<=T.size();J++)_draw_LCS[I+1][J+1]=to_string(LCS[I][J]);
            if(S[i-1]==T[j-1]){
                av.start_frame_draw();
                av.colored_text({ {{"兩個字元 "}},{{"相同"},"rgba(50, 191, 87, 0.46)"},{{" 拿左上角的數值加ㄧ"}} },0,120);
                av.frame_draw("LCS",0,200,_draw_LCS,{
                    {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
                    {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)},
                    {{"background","rgba(50, 191, 87, 0.7)"},{{i+1,0},{0,j+1}}},
                    {{"highlight"},{{i+1,0},{0,j+1},{i+1,j+1}}}
                });
                av.arrow(AV::relPos_to_absPos("LCS",i-1,j-1), AV::relPos_to_absPos("LCS",i,j), { {"color","rgba(50, 191, 87, 0.7)"} });
                if(j==T.size()) {
                    av.key_text("{加速...}",0,120);
                    av.key_frame_draw("LCS",0,200,_draw_LCS,{
                        {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
                        {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)},
                        {{"background","rgba(50, 191, 87, 0.7)"},{{i+1,0},{0,j+1}}},
                        {{"highlight"},{{i+1,j+1}}}
                    });
                    av.key_arrow(AV::relPos_to_absPos("LCS",i-1,j-1), AV::relPos_to_absPos("LCS",i,j), { {"color","rgba(50, 191, 87, 0.7)"} });
                }
                av.end_frame_draw();
            } else {
                av.start_frame_draw();
                av.colored_text({ {{"兩個字元 "}},{{"不相同"},"rgba(254, 62, 62, 0.46)"},{{" 左與上取最大"}} },0,120);
                av.frame_draw("LCS",0,200,_draw_LCS,{
                    {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
                    {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)},
                    {{"background","rgba(254, 62, 62, 0.7)"},{{i+1,0},{0,j+1}}},
                    {{"highlight"},{{i+1,0},{0,j+1},{i+1,j+1}}}
                });
                if(LCS[i-1][j]>=LCS[i][j-1]) {
                    av.arrow(AV::relPos_to_absPos("LCS",i-1,j), AV::relPos_to_absPos("LCS",i,j), { {"color","rgba(50, 191, 87, 0.7)"} });
                    av.arrow(AV::relPos_to_absPos("LCS",i,j-1), AV::relPos_to_absPos("LCS",i,j));
                } else {
                    av.arrow(AV::relPos_to_absPos("LCS",i-1,j), AV::relPos_to_absPos("LCS",i,j));
                    av.arrow(AV::relPos_to_absPos("LCS",i,j-1), AV::relPos_to_absPos("LCS",i,j), { {"color","rgba(50, 191, 87, 0.7)"} });
                }
                if(j==T.size()) {
                    av.key_text("{加速...}",0,120);
                    av.key_frame_draw("LCS",0,200,_draw_LCS,{
                        {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
                        {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)},
                        {{"background","rgba(254, 62, 62, 0.7)"},{{i+1,0},{0,j+1}}},
                        {{"highlight"},{{i+1,j+1}}}
                    });
                    if(LCS[i-1][j]>=LCS[i][j-1]) {
                        av.key_arrow(AV::relPos_to_absPos("LCS",i-1,j), AV::relPos_to_absPos("LCS",i,j), { {"color","rgba(50, 191, 87, 0.7)"} });
                        av.key_arrow(AV::relPos_to_absPos("LCS",i,j-1), AV::relPos_to_absPos("LCS",i,j));
                    } else {
                        av.key_arrow(AV::relPos_to_absPos("LCS",i-1,j), AV::relPos_to_absPos("LCS",i,j));
                        av.key_arrow(AV::relPos_to_absPos("LCS",i,j-1), AV::relPos_to_absPos("LCS",i,j), { {"color","rgba(50, 191, 87, 0.7)"} });
                    }
                }
                av.end_frame_draw();
            }
            //}
        }
        //draw{
        av.start_frame_draw();
        for(int I=0;I<=S.size();I++)for(int J=0;J<=T.size();J++)_draw_LCS[I+1][J+1]=to_string(LCS[I][J]);
        av.colored_text({ {{"這樣計算 LCS 就完成了"}} },0,120);
        av.frame_draw("LCS",0,200,_draw_LCS,{
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)}
        });
        av.key_colored_text({ {{"這樣計算 LCS 就完成了"}} },0,120);
        av.key_frame_draw("LCS",0,200,_draw_LCS,{
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)}
        });
        av.end_frame_draw();
        //}
        for(int i=1;i<=S.size();i++,cout<<endl)for(int j=1;j<=T.size();j++)cout<<LCS[i][j]<<" ";cout<<endl;
        cout<<LCS[S.size()][T.size()]<<endl;
        //draw{
        av.start_frame_draw();
        av.stop();
        av.colored_text({ {{"接下來講講如何把最長共同子序列的序列都找出{來:ㄌㄞˊ}\n先把每個是因為相同字元而取左上角值加ㄧ的格子全部畫上橋\n然後從最右下角開始回朔"}} },0,80);
        av.frame_draw("LCS",0,200,_draw_LCS,{
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)},
            {{"CDVS"},AV::AtoB(1,1,S.size()+1,T.size()+1)}
        });
        for(auto&v:_draw_LCS_path)av.arrow(AV::relPos_to_absPos("LCS", v.f.f, v.f.s), AV::relPos_to_absPos("LCS", v.s.f, v.s.s));
        av.key_colored_text({ {{"接下來講講如何把最長共同子序列的序列都找出{來:ㄌㄞˊ}\n先把每個是因為相同字元而取左上角值加ㄧ的格子全部畫上橋\n然後從最右下角開始回朔"}} },0,80);
        av.key_frame_draw("LCS",0,200,_draw_LCS,{
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)},
            {{"CDVS"},AV::AtoB(1,1,S.size()+1,T.size()+1)}
        });
        for(auto&v:_draw_LCS_path)av.key_arrow(AV::relPos_to_absPos("LCS", v.f.f, v.f.s), AV::relPos_to_absPos("LCS", v.s.f, v.s.s));
        av.end_frame_draw();
        //}
        dfs(S.size(), T.size(), "");
        for(auto&v:ans)cout<<v<<endl;
        //draw{
        av.start_frame_draw();
        av.colored_text({ {{"這樣就找完所有的最大共同子序列了\n答案是 " + AV::array_to_string(AV::to_vector(ans))}} },0,100);
        av.frame_draw("LCS",0,200,_draw_LCS,{
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)},
            {{"CDVS"},AV::AtoB(1,1,S.size()+1,T.size()+1)}
        });
        for(auto&v:_draw_LCS_path)av.arrow(AV::relPos_to_absPos("LCS", v.f.f, v.f.s), AV::relPos_to_absPos("LCS", v.s.f, v.s.s));
        av.key_colored_text({ {{"這樣就找完所有的最大共同子序列了\n答案是 " + AV::array_to_string(AV::to_vector(ans))}} },0,100);
        av.key_frame_draw("LCS",0,200,_draw_LCS,{
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(1,0,S.size()+1,0)},
            {{"background","rgba(111, 161, 255, 0.7)"},AV::AtoB(0,1,0,T.size()+1)},
            {{"CDVS"},AV::AtoB(1,1,S.size()+1,T.size()+1)}
        });
        for(auto&v:_draw_LCS_path)av.key_arrow(AV::relPos_to_absPos("LCS", v.f.f, v.f.s), AV::relPos_to_absPos("LCS", v.s.f, v.s.s));
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
abcdedcba
edcbabcde
*/