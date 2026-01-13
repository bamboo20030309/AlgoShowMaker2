//prefix_sum Sample
#include <bits/stdc++.h>
#include "AV.hpp"
using namespace std;
AV av;

int main() {
    int n=20;
    vector<int> num(n),pre(n);
    for(int i=0;i<n;i++)num[i]=i+1;
    //draw{
    vector<int> _draw_focus;
    av.start_draw();
    av.start_frame_draw();
    av.frame_draw("num" , 0,  0,   num, {}, {0}, "normal", 0, 1);
    av.frame_draw("pre" , 0,150,   pre, {}, {0}, "normal", 0, 1);
    av.end_frame_draw();
    //}
    pre[0]=num[0];
    //draw{
    _draw_focus.push_back(0);
    av.start_frame_draw();
    av.frame_draw("num" , 0,  0,   num, {{{"highlight"},{0}},{{"focus"},_draw_focus},{{"background","rgba(47, 255, 82, 0.44)"},{0}}}, {0}, "normal", 0, 1);
    av.frame_draw("pre" , 0,150,   pre, {{{"highlight"},{0}},{{"focus"},{0}},{{"background","rgba(47, 255, 82, 0.44)"},{0}}}, {0}, "normal", 0, 1);
    av.end_frame_draw();
    //}
    for(int i=1;i<n;i++){
        pre[i]=pre[i-1] + num[i];
        //draw{
        _draw_focus.push_back(i);
        av.start_frame_draw();
        av.frame_draw("num" , 0,  0,   num, {{{"highlight"},{i}},{{"focus"},_draw_focus},{{"background","rgba(47, 255, 82, 0.44)"},AV::AtoB(0,i)}}, {0}, "normal", 0, 1);
        av.frame_draw("pre" , 0,150,   pre, {{{"highlight"},{i-1,i}},{{"focus"},{i}},{{"background","rgba(47, 255, 82, 0.44)"},{i}}}, {0}, "normal", 0, 1);
        av.end_frame_draw();
        //}
    }
    //draw{
    av.start_frame_draw();
    av.frame_draw("num" , 0,  0,   num, {}, {0}, "normal", 0, 1);
    av.frame_draw("pre" , 0,150,   pre, {}, {0}, "normal", 0, 1);
    av.end_frame_draw();
    //}
    int L,R;
    // sum of L to R 
    L=3,R=14;
    //draw{
    av.start_frame_draw();
    av.frame_draw("num" , 0,  0,   num, {}, {0}, "normal", 0, 1);
    av.frame_draw("pre" , 0,150,   pre, {}, {0}, "normal", 0, 1);
    av.end_frame_draw();
    av.end_draw();
    //}
    return 0;
}