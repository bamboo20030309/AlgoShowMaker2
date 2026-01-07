    //Euler's_Sieve Sample
    #include <bits/stdc++.h>
    #include "AV.hpp"
    using namespace std;
    AV av;

    int n=100;
    vector<int> isprime(n+5,1);
    vector<int> prime;
    //draw{
    int _draw_itemsPerRow = 10;
    vector<int> _draw_focus;
    //}
    void prime_table() {
        
        isprime[0]=isprime[1]=0;
        //draw{
        _draw_focus.erase(find(_draw_focus.begin(), _draw_focus.end(), 1));
        av.start_frame_draw();
        av.colored_text({{"首先因為"},{"1不是質數","rgba(241, 255, 47, 0.44)"},{"所以先刪掉"}},0,0);
        av.frame_draw(  "prime" , 0,560,     prime, {},                                                                    {0}  , "normal", _draw_itemsPerRow, 0);
        av.frame_draw("isprime" , 0,90,   isprime, {{{"highlight"},{1}}, {{"focus"},_draw_focus}, {{"background"},{1}} }, {1,n}, "normal", _draw_itemsPerRow, 2);
        av.end_frame_draw();
        //}
        for(int i=2;i<=n;i++){
            
            if(isprime[i])prime.push_back(i);
            //draw{
            int k=0,_k=0;
            vector<int> _key_frame_highlight = {i};
            vector<int> _key_frame_modify = {};
            vector<int> _key_frame_focus;
            vector<int> _key_frame_text;
            for(auto&v:prime){
                if(i*v>n)break;
                _key_frame_highlight.push_back(i*v);
                _key_frame_modify.push_back(i*v);
                _key_frame_focus.push_back(_k++);
                _key_frame_text.push_back(v);
                if(i%v==0)break;
            }
            if(i==8)av.faston();
            if(i==21)av.skip();
            av.start_frame_draw();
            if(isprime[i])av.colored_text( {{"因為 "},{"{isprime}["+to_string(i)+"]={true:是質數}","rgba(47, 255, 82, 0.44)"},{" 所以將其放入 prime" }} ,0,0);
            else          av.colored_text( {{"因為 "},{"{isprime}["+to_string(i)+"]={false:不是質數}","rgba(234, 64, 64, 0.44)"},{" 所以不是質數"}},0,0);
            string _key_text = AV::array_to_string(_key_frame_text);
            if(isprime[i])av.key_colored_text( {{"因為 "},{"{isprime}["+to_string(i)+"]={true:是質數}","rgba(47, 255, 82, 0.44)"},{" {所以}將其放入 prime\n並且一口氣殺掉"+to_string(i)+"{×:乘}"+_key_text+" {這幾個}" }}   ,0,0);
            else          av.key_colored_text( {{"因為 "},{"{isprime}["+to_string(i)+"]={false:不是質數}","rgba(234, 64, 64, 0.44)"},{" {所以}不是質數\n並且一口氣殺掉 "+to_string(i)+"{×:乘}"+_key_text+" {這幾個}"}},0,0);
            
            av.frame_draw    (  "prime" , 0,560,     prime, {},                                                                                                                                                      {0}  , "normal", _draw_itemsPerRow, 0);
            av.frame_draw    ("isprime" , 0,90,   isprime, {{{"highlight"},{i}},                  {{"focus"},_draw_focus},       {{"point"},{i}}, {{"mark"},AV::AtoB(0,i-1)} },                                     {1,n}, "normal", _draw_itemsPerRow, 2);
            av.key_frame_draw(  "prime" , 0,560,     prime, {{{"highlight"},_key_frame_focus},     {{"focus"},_key_frame_focus} },                                                                                   {0}  , "normal", _draw_itemsPerRow, 0);
            av.key_frame_draw("isprime" , 0,90,   isprime, {{{"highlight"},_key_frame_highlight}, {{"focus"},_draw_focus},       {{"point"},{i}}, {{"mark"},AV::AtoB(0,i-1)}, {{"background"},_key_frame_modify} }, {1,n}, "normal", _draw_itemsPerRow, 2);        
        //    av.key_arrow(AV::relPos_to_absPos("isprime",i-1), AV::relPos_to_absPos("prime",k),  {{"color","rgba(13, 102, 13, 0.8)"}, {"label","×"}, {"width","3"}});
            int _tmp_k=0;
            for(auto&v:prime){
                if(i*v>n)break;
                av.key_arrow(AV::relPos_to_absPos("prime",_tmp_k), AV::relPos_to_absPos("isprime",i*v-1), {{"color","rgba(51, 168, 51, 0.7)"}, {"width","3"}});
                _tmp_k++;
                if(i%v==0)break;
            }
            av.end_frame_draw();
            //}
            for(auto&v:prime){
                //draw{
                if(i*v>n) {
                    av.start_frame_draw();
                    av.colored_text({{"因為 "},{to_string(i)+"{×:乘}"+to_string(v)+"="+to_string(i*v)+" 已經超過 "+to_string(n),"rgba(241, 255, 47, 0.44)"},{"\n所以後面省略"}},0,0);
                    av.frame_draw(  "prime" , 0,560,     prime, {{{"highlight"},{k}},     {{"focus"},_key_frame_focus}},                                                                  {0}  , "normal", _draw_itemsPerRow, 0);
                    av.frame_draw("isprime" , 0,90,   isprime, {{{"highlight"},{i,i*prime[k]}}, {{"focus"},_draw_focus}, {{"point"},{i}}, {{"mark"},AV::AtoB(0,i-1)}, {{"background","rgba(255, 82, 82, 0.44)"},{i*prime[k]}} }, {1,n}, "normal", _draw_itemsPerRow, 2);
                    av.end_frame_draw();
                }
                //}
                if(i*v>n)break;
                isprime[i*v]=0;
                //draw{
                auto p = find(_draw_focus.begin(), _draw_focus.end(), i*v);
                if(p!=_draw_focus.end()) _draw_focus.erase(p);
                av.start_frame_draw();
                av.text("因為 "+to_string(i)+"{×:乘}"+to_string(v)+"="+to_string(i*v)+"\n所以殺掉 "+to_string(i*v),0,0);
                av.frame_draw(  "prime" , 0,560,     prime, {{{"highlight"},{k}},     {{"focus"},_key_frame_focus}},                                                                  {0}  , "normal", _draw_itemsPerRow, 0);
                av.frame_draw("isprime" , 0,90,   isprime, {{{"highlight"},{i,i*v}}, {{"focus"},_draw_focus}, {{"point"},{i}}, {{"mark"},AV::AtoB(0,i-1)}, {{"background"},{i*v}} }, {1,n}, "normal", _draw_itemsPerRow, 2);
                av.arrow(AV::relPos_to_absPos("isprime",i-1), AV::relPos_to_absPos("prime",k), {{"color","rgba(13, 102, 13, 0.8)"}, {"label","×"}, {"width","3"}});
                av.arrow(AV::relPos_to_absPos("prime",k), AV::relPos_to_absPos("isprime",i*v-1), {{"color","rgba(51, 168, 51, 0.7)"}, {"label","="}, {"width","3"}});
                av.end_frame_draw();
                k++;
                if(i%v==0 && k!=prime.size()) {
                    av.start_frame_draw();
                    av.colored_text({{"因為 "},{to_string(i)+"{%:能夠整除}"+to_string(v)+"=0","rgba(241, 255, 47, 0.44)"},{"\n所以後面的留著給其他人殺"}},0,0);
                    av.frame_draw(  "prime" , 0,560,     prime, {{{"highlight"},{k}},     {{"focus"},_key_frame_focus}},                                                                  {0}  , "normal", _draw_itemsPerRow, 0);
                    av.frame_draw("isprime" , 0,90,   isprime, {{{"highlight"},{i,i*prime[k]}}, {{"focus"},_draw_focus}, {{"point"},{i}}, {{"mark"},AV::AtoB(0,i-1)}, {{"background","rgba(255, 82, 82, 0.44)"},{i*prime[k]}} }, {1,n}, "normal", _draw_itemsPerRow, 2);
                    av.arrow(AV::relPos_to_absPos("isprime",i-1), AV::relPos_to_absPos("prime",k), {{"color","rgba(255, 0, 0, 0.7)"}, {"label","×"}, {"width","3"}});
                    av.arrow(AV::relPos_to_absPos("prime",k), AV::relPos_to_absPos("isprime",i*prime[k]-1), {{"color","rgba(255, 62, 62, 0.7)"}, {"label","="}, {"width","3"}});
                    av.end_frame_draw();
                }
                //}
                if(i%v==0)break;
            }
        }
    } 
    int main(){

        //draw{
        for(int i=1;i<=n;i++) _draw_focus.push_back(i);
        av.start_draw();
        av.start_frame_draw();
        av.text("這是線篩{的演算法視覺化範例}",0,0);
        av.frame_draw(  "prime" , 0,560,     prime, {},                        {0}  , "normal", _draw_itemsPerRow, 0);
        av.frame_draw("isprime" , 0,90,   isprime, {{{"focus"},_draw_focus}}, {1,n}, "normal", _draw_itemsPerRow, 2);
        av.end_frame_draw();
        //}

        prime_table();

        //draw{
        av.stop();
        av.start_frame_draw();
        av.text("最後就完成了",0,0);
        av.frame_draw(  "prime" , 0,560,     prime, {},                        {0}  , "normal", _draw_itemsPerRow, 0);
        av.frame_draw("isprime" , 0,90,   isprime, {{{"focus"},_draw_focus}}, {1,n}, "normal", _draw_itemsPerRow, 2);
        av.end_frame_draw();
        av.end_draw();
        //}
        return 0;
    }