//Binary_Indexed_Tree Sample
#include <bits/stdc++.h>
#include "AV.hpp"
using namespace std;
AV av;
int n;
vector<int> num,BIT;
//draw{
vector<int> _draw_BIT;
//}
void build(int i,int x){
    //draw{
    int k=i;
    vector<int> _draw_focus={i};
    while(k<=n){
        k+=(k&-k);
        _draw_focus.push_back(k);
    }
    av.start_frame_draw();
    av.text("從"+to_string(i)+"往上建",40,-60);
    av.frame_draw("num" , 0,320,   num, {}, {0}, "normal", 0, 1);
    av.frame_draw("BIT" ,40,  0,   BIT, { {{"highlight"},{i}} }, {0},    "BIT", 0, 4);
    av.end_frame_draw();
    //}
    while(i<=n){
        BIT[i]+=x;
        //draw{
        av.start_frame_draw();
        av.text( "{每一次}把 index 加上最小的 bit 後將" + to_string(x) + "加上去 (lowbit = i&-i)" ,40,-60);
        av.frame_draw("num" , 0,320,   num, {{{"background","rgba(47, 255, 82, 0.44)"},AV::AtoB(i-(i&-i)+1,i)}}, {0}, "normal", 0, 1);
        av.frame_draw("BIT" ,40,  0,   BIT, {{{"highlight"},{i}},{{"focus"},_draw_focus},{{"background","rgba(47, 255, 82, 0.44)"},{i}}}, {0},    "BIT", 0, 4);
        av.end_frame_draw();
        //}
        i+=(i&-i);
    }
}
int sum(int i){
    //draw{
    int k=i;
    vector<int> _draw_focus={i};
    while(k){
        k-=(k&-k);
        _draw_focus.push_back(k);
    }
    _draw_BIT = _draw_focus;
    //}
    int ans=0;
	while(i){
        ans+=BIT[i];
        //draw{
        av.start_frame_draw();
        av.text( "{每一次查詢就}把index減掉最小的bit後將" + to_string(BIT[i]) + "累計起來 ans=" + to_string(ans) + " (lowbit = i&-i)" ,40,-60);
        av.frame_draw("num" , 0,320,   num, {{{"background","rgba(47, 255, 82, 0.44)"},AV::AtoB(i-(i&-i)+1,i)}}, {0}, "normal", 0, 1);
        av.frame_draw("BIT" ,40,  0,   BIT, {{{"highlight"},{i}},{{"focus"},_draw_focus},{{"background","rgba(47, 255, 82, 0.44)"},{i}}}, {0},    "BIT", 0, 4);
        av.end_frame_draw();
        //}
        i-=(i&-i);
    }
	return ans;
}

int main() {
    n=16;
    BIT.resize(n+1);
    num.resize(n+1);

    //draw{
    av.start_draw();
    av.start_frame_draw();
    av.text("這是 Binary Index Tree {的演算法範例}",40,-60);
    av.frame_draw("num" , 0,320,   num, {}, {0}, "normal", 0, 1);
    av.frame_draw("BIT" ,40,  0,   BIT, {}, {0},    "BIT", 0, 4);
    av.end_frame_draw();
    //}

    for(int i=1;i<=n;i++) num[i]=i, build(i,num[i]);

    //draw{
    av.start_frame_draw();
    av.text("這樣就建完樹了",40,-60);
    av.frame_draw("num" , 0,320,   num, {}, {0}, "normal", 0, 1);
    av.frame_draw("BIT" ,40,  0,   BIT, {}, {0},    "BIT", 0, 4);
    av.end_frame_draw();
    av.stop();
    //}


    int L=5,R=13;
    //draw{
    av.start_frame_draw();
    av.text("假設要計算" + to_string(L) + "~" + to_string(R) + "的累計值\n那就是先計算樹中1~" + to_string(R) + "的總和後再減掉1~" + to_string(L-1) + "就可以得到" + to_string(L) + "~" + to_string(R) + "的區間值了",40,-80);
    av.frame_draw("num" , 0,320,   num, {}, {0}, "normal", 0, 1);
    av.frame_draw("BIT" ,40,  0,   BIT, {}, {0},    "BIT", 0, 4);
    av.end_frame_draw();
    //}

    int sumR = sum(R);

    //draw{
    vector<int> _draw_R = _draw_BIT;
    av.start_frame_draw();
    av.text("得到1~" + to_string(R) + "的總和是" + to_string(sumR) ,40,-60);
    av.frame_draw("num" , 0,320,   num, {{{"background","rgba(41, 162, 243, 0.44)"},AV::AtoB(1,R)}}, {0}, "normal", 0, 1);
    av.frame_draw("BIT" ,40,  0,   BIT, {{{"background","rgba(41, 162, 243, 0.44)"},_draw_BIT}}, {0},    "BIT", 0, 4);
    av.end_frame_draw();
    //}

    int sumL = sum(L-1);

    //draw{
    vector<int> _draw_L = _draw_BIT;
    av.start_frame_draw();
    av.text("得到1~" + to_string(L-1) + "的總和是" + to_string(sumL) ,40,-60);
    av.frame_draw("num" , 0,320,   num, {{{"background","rgba(65, 215, 253, 0.44)"},AV::AtoB(1,L-1)}}, {0}, "normal", 0, 1);
    av.frame_draw("BIT" ,40,  0,   BIT, {{{"background","rgba(65, 215, 253, 0.44)"},_draw_BIT}}, {0},    "BIT", 0, 4);
    av.end_frame_draw();
    //}
    //draw{
    av.start_frame_draw();
    av.text("最後查詢結果也就是 右區間-左區間 = " + to_string(sumR) + "-" + to_string(sumL) + "=" + to_string(sumR-sumL),40,-60);
    av.frame_draw("num" , 0,320,   num, {{{"background","rgba(47, 255, 82, 0.44)"},AV::AtoB(L,R)}}, {0}, "normal", 0, 1);
    av.frame_draw("BIT" ,40,  0,   BIT, {{{"background","rgba(41, 162, 243, 0.44)"},_draw_R},{{"background","rgba(65, 215, 253, 0.44)"},_draw_L}}, {0},    "BIT", 0, 4);
    av.end_frame_draw();
    av.end_draw();
    //}

    cout<<"sum of L to R = "<<sumR-sumL<<endl;

    return 0;
}