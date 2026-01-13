//Max Heap Sample
#include <bits/stdc++.h>
#include "AV.hpp"
using namespace std;
AV av;
vector<int> heap = {0};
//draw{
string _draw_up_color = "rgba(32, 140, 255, 0.44)", _draw_down_color = "rgba(123, 209, 255, 0.44)";
//}
void heap_push (int n) {
    int now = heap.size();
    heap.push_back(n);
    //draw{
    vector<int> _draw_focus;
    for(int i=now;i>0;i>>=1) _draw_focus.push_back(i);
    av.start_frame_draw();
    av.colored_text( {{"{現在要}"},{"新增: "+to_string(n),"rgba(47, 255, 82, 0.44)"},{"{進入 heap\n第一步驟}: 先將他 push 到陣列的最後"}}, 0, -80);
    av.frame_draw("num" , 0, 0,   heap, { {{"highlight"},{now}}, {{"background","rgba(47, 255, 82, 0.44)"},{now}} }, {0}, "normal", 0, 1);
    av.frame_draw("heap", 0, 150, heap, { {{"highlight"},{now}}, {{"background","rgba(47, 255, 82, 0.44)"},{now}} }, {0}, "heap",  10, 1);
    av.end_frame_draw();
    //}
    while(now > 1){
        if(heap[now>>1] >= heap[now]) {
            //draw{
            av.start_frame_draw();
            av.colored_text( {{"上層比下層大"},{"不用交換","rgba(255, 82, 82, 0.44)"}}, 0, -60);
            av.frame_draw("num" , 0, 0,   heap, { {{"highlight"},{now>>1,now}}, {{"focus"},_draw_focus}, {{"background","rgba(255, 82, 82, 0.44)"},{now>>1}} }, {0}, "normal", 0, 1);
            av.frame_draw("heap", 0, 150, heap, { {{"highlight"},{now>>1,now}}, {{"focus"},_draw_focus}, {{"background","rgba(255, 82, 82, 0.44)"},{now>>1}} }, {0}, "heap" , 10, 1);
            av.end_frame_draw();
            //}
            break;
        } else {
            //draw{
            av.start_frame_draw();
            av.colored_text( {{"上層",_draw_up_color},{"比"},{"下層",_draw_down_color},{"小的時候"}}, 0, -60);
            av.frame_draw("num" , 0, 0,   heap, { {{"highlight"},{now>>1,now}}, {{"focus"},_draw_focus}, {{"background",_draw_up_color},{now>>1}}, {{"background",_draw_down_color},{now}} }, {0}, "normal", 0, 1);
            av.frame_draw("heap", 0, 150, heap, { {{"highlight"},{now>>1,now}}, {{"focus"},_draw_focus}, {{"background",_draw_up_color},{now>>1}}, {{"background",_draw_down_color},{now}} }, {0}, "heap" , 10, 1);
            av.end_frame_draw();
            //}
            swap(heap[now>>1],heap[now]); 
            //draw{
            av.start_frame_draw();
            av.colored_text( {{"上層",_draw_down_color},{"和"},{"下層",_draw_up_color},{"就上下交換"}}, 0, -60);
            av.frame_draw("num" , 0, 0,   heap, { {{"highlight"},{now>>1,now}}, {{"focus"},_draw_focus}, {{"background",_draw_down_color},{now>>1}}, {{"background",_draw_up_color},{now}} }, {0}, "normal", 0, 1);
            av.frame_draw("heap", 0, 150, heap, { {{"highlight"},{now>>1,now}}, {{"focus"},_draw_focus}, {{"background",_draw_down_color},{now>>1}}, {{"background",_draw_up_color},{now}} }, {0}, "heap" , 10, 1);
            av.end_frame_draw();
            //}
            now>>=1;
        }
    }
}

int heap_top(){
    //draw{
    av.start_frame_draw();
    av.colored_text( {{"查詢","rgba(47, 255, 82, 0.44)"},{"heap中最大元素: "},{to_string(heap[1]),"rgba(47, 255, 82, 0.44)"} }, 0, -60);
    av.frame_draw("num" , 0, 0,   heap, { {{"highlight"},{1}}, {{"background","rgba(47, 255, 82, 0.44)"},{1}} }, {0}, "normal", 0, 1);
    av.frame_draw("heap", 0, 150, heap, { {{"highlight"},{1}}, {{"background","rgba(47, 255, 82, 0.44)"},{1}} }, {0}, "heap",  10, 1);
    av.end_frame_draw();
    //}
    if(heap.size()>1)return heap[1];
}

void heap_pop() {
    int Size = heap.size()-1;
    //draw{
    av.start_frame_draw();
    av.colored_text( {{"刪除","rgba(255, 82, 82, 0.44)"},{"heap中最大元素: "},{to_string(heap[1]),"rgba(255, 82, 82, 0.44)"} }, 0, -60);
    av.frame_draw("num" , 0, 0,   heap, { {{"highlight"},{1,Size}}, {{"focus"},{1,Size}}, {{"background","rgba(255, 82, 82, 0.44)"},{Size}} }, {0}, "normal", 0, 1);
    av.frame_draw("heap", 0, 150, heap, { {{"highlight"},{1,Size}}, {{"focus"},{1,Size}}, {{"background","rgba(255, 82, 82, 0.44)"},{Size}} }, {0}, "heap",  10, 1);
    av.end_frame_draw();
    //}
    //draw{
    av.start_frame_draw();
    av.colored_text( {{"先把"},{"最前面",_draw_up_color},{"和"},{"最後面",_draw_down_color},{"交換"}}, 0, -60);
    av.frame_draw("num" , 0, 0,   heap, { {{"highlight"},{1,Size}}, {{"focus"},{1,Size}}, {{"background",_draw_up_color},{1}}, {{"background",_draw_down_color},{Size}} }, {0}, "normal", 0, 1);
    av.frame_draw("heap", 0, 150, heap, { {{"highlight"},{1,Size}}, {{"focus"},{1,Size}}, {{"background",_draw_up_color},{1}}, {{"background",_draw_down_color},{Size}} }, {0}, "heap",  10, 1);
    av.end_frame_draw();
    //}
    swap(heap[1],heap[Size]);
    //draw{
    av.start_frame_draw();
    av.colored_text( {{"{先把}"},{"最前面",_draw_down_color},{"和"},{"最後面",_draw_up_color},{"交換"}}, 0, -60);
    av.frame_draw("num" , 0, 0,   heap, { {{"highlight"},{1,Size}}, {{"focus"},{1,Size}}, {{"background",_draw_down_color},{1}}, {{"background",_draw_up_color},{Size}} }, {0}, "normal", 0, 1);
    av.frame_draw("heap", 0, 150, heap, { {{"highlight"},{1,Size}}, {{"focus"},{1,Size}}, {{"background",_draw_down_color},{1}}, {{"background",_draw_up_color},{Size}} }, {0}, "heap",  10, 1);
    av.end_frame_draw();
    //}
    heap.pop_back(); Size--;
    //draw{
    av.start_frame_draw();
    av.colored_text( {{"{接著}刪除掉最後面的格子"}}, 0, -60);
    av.frame_draw("num" , 0, 0,   heap, { {{"focus"},{1}} }, {0}, "normal", 0, 1);
    av.frame_draw("heap", 0, 150, heap, { {{"focus"},{1}} }, {0}, "heap",  10, 1);
    av.end_frame_draw();
    //}
    int now=1;
    while (now*2+1 <= Size) {
        //draw{
        av.start_frame_draw();
        av.colored_text( {{"看看"},{"下層的兩個格子",_draw_down_color},{"有沒有比"},{"上層",_draw_up_color},{"大"}}, 0, -60);
        av.frame_draw("num" , 0, 0,   heap, { {{"highlight"},{now<<1,(now<<1)+1}}, {{"focus"},{now,now<<1,(now<<1)+1}}, {{"background",_draw_up_color},{now}}, {{"background",_draw_down_color},{now<<1,(now<<1)+1}} }, {0}, "normal", 0, 1);
        av.frame_draw("heap", 0, 150, heap, { {{"highlight"},{now<<1,(now<<1)+1}}, {{"focus"},{now,now<<1,(now<<1)+1}}, {{"background",_draw_up_color},{now}}, {{"background",_draw_down_color},{now<<1,(now<<1)+1}} }, {0}, "heap",  10, 1);
        av.end_frame_draw();
        //}
        int Max = max(heap[now<<1], heap[(now<<1)+1]);
        if (heap[now] < Max) {
            if(heap[now<<1] > heap[(now<<1)+1]) {
                //draw{
                av.start_frame_draw();
                av.colored_text( {{"{有的話}"},{"大的那個",_draw_down_color},{"跟"},{"上層",_draw_up_color},{"交換"}}, 0, -60);
                av.frame_draw("num" , 0, 0,   heap, { {{"highlight"},{now,now<<1}}, {{"focus"},{now,now<<1,(now<<1)+1}}, {{"background",_draw_up_color},{now}}, {{"background",_draw_down_color},{now<<1}} }, {0}, "normal", 0, 1);
                av.frame_draw("heap", 0, 150, heap, { {{"highlight"},{now,now<<1}}, {{"focus"},{now,now<<1,(now<<1)+1}}, {{"background",_draw_up_color},{now}}, {{"background",_draw_down_color},{now<<1}} }, {0}, "heap",  10, 1);
                av.end_frame_draw();
                //}
                swap(heap[now<<1], heap[now]);
                //draw{
                av.start_frame_draw();
                av.colored_text( {{"{有的話}"},{"{大的那個}",_draw_up_color},{"{跟}"},{"{上層}",_draw_down_color},{"{交換}"}}, 0, -60);
                av.frame_draw("num" , 0, 0,   heap, { {{"highlight"},{now,now<<1}}, {{"focus"},{now,now<<1,(now<<1)+1}}, {{"background",_draw_down_color},{now}}, {{"background",_draw_up_color},{now<<1}} }, {0}, "normal", 0, 1);
                av.frame_draw("heap", 0, 150, heap, { {{"highlight"},{now,now<<1}}, {{"focus"},{now,now<<1,(now<<1)+1}}, {{"background",_draw_down_color},{now}}, {{"background",_draw_up_color},{now<<1}} }, {0}, "heap",  10, 1);
                av.end_frame_draw();
                //}
                now = (now<<1);
            } else {
                //draw{
                av.start_frame_draw();
                av.colored_text( {{"{有的話}"},{"大的那個",_draw_down_color},{"跟"},{"上層",_draw_up_color},{"交換"}}, 0, -60);
                av.frame_draw("num" , 0, 0,   heap, { {{"highlight"},{now,(now<<1)+1}}, {{"focus"},{now,now<<1,(now<<1)+1}}, {{"background",_draw_up_color},{now}}, {{"background",_draw_down_color},{(now<<1)+1}} }, {0}, "normal", 0, 1);
                av.frame_draw("heap", 0, 150, heap, { {{"highlight"},{now,(now<<1)+1}}, {{"focus"},{now,now<<1,(now<<1)+1}}, {{"background",_draw_up_color},{now}}, {{"background",_draw_down_color},{(now<<1)+1}} }, {0}, "heap",  10, 1);
                av.end_frame_draw();
                //}
                swap(heap[(now<<1)+1], heap[now]);
                //draw{
                av.start_frame_draw();
                av.colored_text( {{"{有的話}"},{"{大的那個}",_draw_up_color},{"{跟}"},{"{上層}",_draw_down_color},{"{交換}"}}, 0, -60);
                av.frame_draw("num" , 0, 0,   heap, { {{"highlight"},{now,(now<<1)+1}}, {{"focus"},{now,now<<1,(now<<1)+1}}, {{"background",_draw_down_color},{now}}, {{"background",_draw_up_color},{(now<<1)+1}} }, {0}, "normal", 0, 1);
                av.frame_draw("heap", 0, 150, heap, { {{"highlight"},{now,(now<<1)+1}}, {{"focus"},{now,now<<1,(now<<1)+1}}, {{"background",_draw_down_color},{now}}, {{"background",_draw_up_color},{(now<<1)+1}} }, {0}, "heap",  10, 1);
                av.end_frame_draw();
                //}
                now = (now<<1)+1;
            }
        } else {
            //draw{
            av.start_frame_draw();
            av.colored_text( {{"{沒有的話}就不用交換"}}, 0, -60);
            av.frame_draw("num" , 0, 0,   heap, { {{"highlight"},{now<<1,(now<<1)+1}}, {{"focus"},{now,now<<1,(now<<1)+1}}, {{"background","rgba(255, 82, 82, 0.44)"},{now<<1,(now<<1)+1}} }, {0}, "normal", 0, 1);
            av.frame_draw("heap", 0, 150, heap, { {{"highlight"},{now<<1,(now<<1)+1}}, {{"focus"},{now,now<<1,(now<<1)+1}}, {{"background","rgba(255, 82, 82, 0.44)"},{now<<1,(now<<1)+1}} }, {0}, "heap",  10, 1);
            av.end_frame_draw();
            //}
            break;
        }
    }
    if (Size == 2) {
        //draw{
        av.start_frame_draw();
        av.colored_text( {{"看看"},{"下層",_draw_down_color},{"有沒有比"},{"上層",_draw_up_color},{"大"}}, 0, -60);
        av.frame_draw("num" , 0, 0,   heap, { {{"highlight"},{now<<1,(now<<1)+1}}, {{"focus"},{now,now<<1,(now<<1)+1}}, {{"background",_draw_up_color},{now}}, {{"background",_draw_down_color},{now<<1,(now<<1)+1}} }, {0}, "normal", 0, 1);
        av.frame_draw("heap", 0, 150, heap, { {{"highlight"},{now<<1,(now<<1)+1}}, {{"focus"},{now,now<<1,(now<<1)+1}}, {{"background",_draw_up_color},{now}}, {{"background",_draw_down_color},{now<<1,(now<<1)+1}} }, {0}, "heap",  10, 1);
        av.end_frame_draw();
        //}
        if(heap[now] < heap[now<<1]) {
            //draw{
            av.start_frame_draw();
            av.colored_text( {{"{因為只剩一個就直接}"},{"下層",_draw_up_color},{"跟"},{"上層",_draw_down_color},{"交換"}}, 0, -60);
            av.frame_draw("num" , 0, 0,   heap, { {{"highlight"},{now,now<<1}}, {{"focus"},{now,now<<1,(now<<1)+1}}, {{"background",_draw_up_color},{now}}, {{"background",_draw_down_color},{now<<1}} }, {0}, "normal", 0, 1);
            av.frame_draw("heap", 0, 150, heap, { {{"highlight"},{now,now<<1}}, {{"focus"},{now,now<<1,(now<<1)+1}}, {{"background",_draw_up_color},{now}}, {{"background",_draw_down_color},{now<<1}} }, {0}, "heap",  10, 1);
            av.end_frame_draw();
            //}
            swap(heap[now<<1], heap[now]);
            //draw{
            av.start_frame_draw();
            av.colored_text( {{"{因為只剩一個就直接}"},{"{下層}",_draw_down_color},{"{跟}"},{"{上層}",_draw_up_color},{"{交換}"}}, 0, -60);
            av.frame_draw("num" , 0, 0,   heap, { {{"highlight"},{now,now<<1}}, {{"focus"},{now,now<<1,(now<<1)+1}}, {{"background",_draw_down_color},{now}}, {{"background",_draw_up_color},{now<<1}} }, {0}, "normal", 0, 1);
            av.frame_draw("heap", 0, 150, heap, { {{"highlight"},{now,now<<1}}, {{"focus"},{now,now<<1,(now<<1)+1}}, {{"background",_draw_down_color},{now}}, {{"background",_draw_up_color},{now<<1}} }, {0}, "heap",  10, 1);
            av.end_frame_draw();
            //}
            now = (now<<1);
        } else {
            //draw{
            av.start_frame_draw();
            av.colored_text( {{"{沒有的話}就不用交換"}}, 0, -60);
            av.frame_draw("num" , 0, 0,   heap, { {{"highlight"},{now<<1}}, {{"focus"},{now}}, {{"background","rgba(255, 82, 82, 0.44)"},{now<<1}} }, {0}, "normal", 0, 1);
            av.frame_draw("heap", 0, 150, heap, { {{"highlight"},{now<<1}}, {{"focus"},{now}}, {{"background","rgba(255, 82, 82, 0.44)"},{now<<1}} }, {0}, "heap",  10, 1);
            av.end_frame_draw();
            //}
        }
    }
    
    
}


int main() {
    //draw{
    av.start_draw();
    av.start_frame_draw();
    av.text("這是堆積(heap){的演算法範例}", 0, -60);
    av.frame_draw("num" , 0, 0,   heap, {}, {0}, "normal", 0, 1);
    av.frame_draw("heap", 0, 150, heap, {}, {0}, "heap",  10, 1);
    av.end_frame_draw();
    //}
    vector<int> Input = {10, 67, 24, 1, 5, 36, 5, 11, 24, 100};
    for (auto&v:Input) {
        heap_push(v);
    }
    //draw{
    av.start_frame_draw();
    av.text("來看看查詢和刪除", 0, -60);
    av.frame_draw("num" , 0, 0,   heap, {}, {0}, "normal", 0, 1);
    av.frame_draw("heap", 0, 150, heap, {}, {0}, "heap",  10, 1);
    av.end_frame_draw();
    av.stop();
    //}
    while(heap.size()>1) {
        cout<< heap_top() <<endl, heap_pop();
    }
    //draw{
    av.start_frame_draw();
    av.text("到這邊就完成啦", 0, -60);
    av.frame_draw("num" , 0, 0,   heap, {}, {0}, "normal", 0, 1);
    av.frame_draw("heap", 0, 150, heap, {}, {0}, "heap",  10, 1);
    av.end_frame_draw();
    av.end_draw();
    //}
    return 0;
}