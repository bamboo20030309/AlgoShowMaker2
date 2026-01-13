//Sieve_of_Eratosthenes Sample
#include <bits/stdc++.h>
#include "AV.hpp"
using namespace std;
AV av;

int main() {
    int n=100;
    vector<int> isprime(n+5,1);
    vector<int> prime;
    isprime[0] = isprime[1] = 0;
    //draw{
    av.start_draw();
    av.start_frame_draw();
    av.text("這是埃篩{的演算法範例}",0,-60);
    av.frame_draw("prime" , 0, 0,   isprime, {}, {1,n}, "normal", 10, 2);
    av.end_frame_draw();
    vector<int> _draw_focus;
    for(int i=1;i<=n;i++)_draw_focus.push_back(i);
    _draw_focus.erase(find(_draw_focus.begin(), _draw_focus.end(), 1));
    av.start_frame_draw();
    av.text("先把1刪掉",0,-60);
    av.frame_draw("prime" , 0, 0,   isprime, {{{"highlight"},{1}}, {{"focus"}, _draw_focus} }, {1,n}, "normal", 10, 2);
    av.end_frame_draw();
    //}
    
    for(int i=2;i*i<=n;i++) {
        //draw{
        int _k=0;
        av.start_frame_draw();
        if(isprime[i])av.colored_text({ {"因為"}, {to_string(i)+"是質數", "rgba(47, 255, 82, 0.44)"}, {"所以把"+to_string(i)+"的倍數全部塗黑"}},0,-60);
        else          av.colored_text({ {"因為"}, {to_string(i)+"不是質數", "rgba(234, 64, 64, 0.44)"}, {"所以可以直接跳過"}},0,-60);
        av.frame_draw("prime" , 0, 0,   isprime, {{{"highlight"},{i}}, {{"focus"},_draw_focus}, {{"point"},{i}} }, {1,n}, "normal", 10, 2);
        if(isprime[i]) {
            int k=i;
            vector<int> _draw_highlight = {k};
            vector<int> _draw_modify;
            
            while(k+i<=n){
                k+=i;
                _draw_highlight.push_back(k);
                _draw_modify.push_back(k);
            }
            av.key_colored_text({{"因為"},{to_string(i)+"是質數", "rgba(47, 255, 82, 0.44)"},{"把"+to_string(i)+"的倍數全部塗黑"}},0,-60);
            av.key_frame_draw("prime" , 0, 0,   isprime, {{{"highlight"},_draw_highlight}, {{"focus"},_draw_focus}, {{"point"},{i}} }, {1,n}, "normal", 10, 2);
        }
        av.end_frame_draw();
        //}
        if(isprime[i]) {
            prime.push_back(i);
            int k=i;
            
            while(k+i<=n){
                k+=i;
                isprime[k]=0;
                //draw{
                if(_k++>8)av.fast();
                auto p = find(_draw_focus.begin(), _draw_focus.end(), k);
                if(p!=_draw_focus.end()) _draw_focus.erase(p);
                av.start_frame_draw();
                av.colored_text({ {"塗黑 "+to_string(k)}},0,-60);
                av.frame_draw("prime" , 0, 0,   isprime, {{{"highlight"},{i,k}}, {{"focus"},_draw_focus}, {{"point"},{i}}, {{"background"},{k} }}, {1,n}, "normal", 10, 2);
                av.end_frame_draw();
                //}
            }
        }
    }
    
    //draw{
    av.start_frame_draw();
    av.text("{最後就完成了}",0,-60);
    av.frame_draw("prime" , 0, 0,   isprime, { {{"focus"},_draw_focus} }, {1,n}, "normal", 10, 2);
    av.end_frame_draw();
    av.end_draw();
    //}
    return 0;
}