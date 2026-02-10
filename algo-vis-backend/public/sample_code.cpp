#include <bits/stdc++.h>
#include "AV.hpp"
using namespace std;
AV av;
int main() {
    vector<int> num={0};
    av.start_draw();
    for (int i = 0; i < 20; i++) {
        num.push_back(i+1);
        av.start_frame_draw();
        av.frame_draw("num", Pos(0,0), num, {{{"highlight"},{i}}, {{"focus"},{i}}, {{"point"},{i}}, {{"mark"},{i}}, {{"background"},{i}}}, {0},  "normal", 0, 1);
        av.frame_draw("heap", Pos("num","bottom-left",0,100), num, {{{"highlight"},{i-1}}, {{"focus"},{i-1}}, {{"point"},{i-1}}, {{"mark"},{i-1}}, {{"background"},{i-1}}}, {0},  "heap", 10, 1);
        av.frame_draw("BIT", Pos("heap","bottom-left",0,100), num, {{{"highlight"},{i-1}}, {{"focus"},{i-1}}, {{"point"},{i-1}}, {{"mark"},{i-1}}, {{"background"},{i-1}}}, {0},  "BIT", 10, 1);
        av.arrow( Pos("num","bottom"), Pos("heap","top"), {{"color","black"},{"width","3"}});
        av.arrow( Pos("num",i+1), Pos("BIT",i));
        if(i==3 || i==7 || i==13) {
            av.key_frame_draw("num", 0, 0, num, {{{"mark"},AV::AtoB(0,i)}, {{"highlight"},{i}}, {{"point"},{i}}, {{"focus"},{i}}, {{"background"},{i}}}, {0},  "normal", 0, 1);
            av.key_frame_draw("heap", 0, 150, num, {{{"mark"},AV::AtoB(0,i)}, {{"highlight"},{i-1}}, {{"point"},{i-1}}, {{"focus"},{i-1}}, {{"background"},{i-1}}}, {0},  "heap", 10, 1);
            av.key_frame_draw("BIT", 0, 300, num, {{{"mark"},AV::AtoB(0,i)}, {{"highlight"},{i-1}}, {{"point"},{i-1}}, {{"focus"},{i-1}}, {{"background"},{i-1}}}, {0},  "BIT", 10, 1);
        }
        av.end_frame_draw();
    }
    av.end_draw();
    return 0;
}