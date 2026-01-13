//Segment_Tree Sample
#include <bits/stdc++.h>
#include "AV.hpp"
using namespace std;
AV av;

#define pb push_back
#define int int
#define LM INT_MAX
#define Hbit(X) (32-__builtin_clzll(X))
vector<int> tree,lazy,sets;
int Tmask,Tsize,Tdeep,n;

//draw{
vector<int> _draw_focus;
vector<vector<int>> _draw_segment(3,vector<int>());
string _draw_seg_color;
//}

int rule(int a, int b){
    return a+b;
}
void build(){
    Tmask=1<<Hbit(n-1), Tsize=Tmask+n, Tdeep=Hbit(n-1)+1;
    tree.assign(1<<Tdeep,0); //如果要改成min的話 0要改成LM
    lazy.assign(1<<Tdeep,0); //如果要改成min的話 0要改成LM
    sets.assign(1<<Tdeep,LM); //如果要改成min的話 0要改成LM
//    for(int i=Tsize-n;i<Tsize;i++)cin>>tree[i];
    for(int i=Tsize-n;i<Tsize;i++)tree[i]=Tsize-i;
    for(int i=Tsize-n-1;i>0;i--)tree[i]= rule(tree[i<<1],tree[i<<1|1]); //改變建樹規則要注意這
}
//query就放前4個值 Add就放前五個值 set就前六個Add放0  前四個放Tmask, (Tmask<<1)-1, (x|Tmask), (y|Tmask) 0(base)
int query(int l,int r,int L,int R,int now=1){ //如果要改成min的話 Add要改成LM
    if(L<=l && r<=R){ //所有尾端的節點 必須在這處理並停止
        //draw{
        for(int i=0;i<_draw_segment[0].size();i++) {
            if(_draw_segment[0][i]==now) {
                _draw_segment[0].erase(_draw_segment[0].begin()+i);
                _draw_segment[1].erase(_draw_segment[1].begin()+i);
                _draw_segment[2].erase(_draw_segment[2].begin()+i);
                break;
            }
        }
        av.start_frame_draw();
        av.text("找到符合大小的區段就回傳 "+to_string(tree[now]),0,-60);   
        av.frame_draw("tree" , 0,   0,   tree, {{{"highlight"},{now}}, {{"focus"},_draw_focus}, {{"point"},{now}}, {{"seg_bg",_draw_seg_color},{}} }, {1,n}, "segment_tree", 20, 1, lazy, sets, _draw_segment[0], _draw_segment[1], _draw_segment[2], {}, {{{now,0},""},{{now,2},""},{{now,4},""}});
        av.key_frame_draw("tree" , 0,   0,   tree, {{{"highlight"},{now}}, {{"focus"},_draw_focus}, {{"point"},{now}}, {{"seg_bg",_draw_seg_color},{}} }, {1,n}, "segment_tree", 20, 1, lazy, sets, _draw_segment[0], _draw_segment[1], _draw_segment[2]);
        av.end_frame_draw();
        //}
        return tree[now]; 
    }
    //因為區間最少就是1 不會跑到這下面 讓尋找子節點的過程超界 因此不需要開到4*n記憶體
    int m=(l+r)>>1,M=r-m, sum=0; //如果要改成min的話 sum要改成LM
    //我的樹左邊跟右邊的區段一定是一樣的 所以直接r-m就好

    //draw{
    av.start_frame_draw();
    av.text("{從最上面一路往下遞迴:一路遞迴拆下去}\n{並且遇到中線就將它二分後拆分推下去}",0,-80);
    av.frame_draw("tree" , 0,   0, tree, {{{"highlight"},{now}}, {{"focus"},_draw_focus}, {{"point"},{now}}, {{"seg_bg",_draw_seg_color},{}} }, {1,n}, "segment_tree", 20, 1, lazy, sets, _draw_segment[0], _draw_segment[1], _draw_segment[2]);
    av.end_frame_draw();
    //}
    //draw{
    for(int i=0;i<_draw_segment[0].size();i++) {
        if(_draw_segment[0][i]==now) {
            if(L<=m)_draw_segment[0].pb(now<<1  ); 
            if(L<=m)_draw_segment[1].pb(_draw_segment[1][i]); 
            if(L<=m) {
                if(R< M)_draw_segment[2].pb(M); 
                else    _draw_segment[2].pb(_draw_segment[2][i]); 
            }

            if(R> m)_draw_segment[0].pb(now<<1|1);
            if(R> m) {
                if(L> M)_draw_segment[1].pb(_draw_segment[1][i]); 
                else    _draw_segment[1].pb(M); 
            }
            if(R> m)_draw_segment[2].pb(_draw_segment[2][i]);

            _draw_segment[0].erase(_draw_segment[0].begin()+i);
            _draw_segment[1].erase(_draw_segment[1].begin()+i);
            _draw_segment[2].erase(_draw_segment[2].begin()+i);
            break;
        }
    }
    //}

    if(L<=m)sum=rule(sum,query(l  , m, L, R, now<<1  )); 
    if(R> m)sum=rule(sum,query(m+1, r, L, R, now<<1|1));
    tree[now]=rule(tree[now<<1],tree[now<<1|1]);

    return sum;
}
int main(){
//    int m,q,x,y,k; cin>>n>>m;
    n=15;
    build();

    //draw{
    set<int> _draw_focus_tmp;
    for(int i=Tmask;i<Tmask+n;i++){
        int tmp=i;
        for(;tmp;tmp>>=1)_draw_focus_tmp.insert(tmp);
    }
    for(auto&v:_draw_focus_tmp)_draw_focus.pb(v);

    av.start_draw();
    av.start_frame_draw();
    av.colored_text({{{"這是一顆只包含查詢功能的線段樹\n每一層皆是由底下兩層相加而來的\n最底下一行是輸入的測資\n在建樹的時候先輸入測資後再一路往上建構出來的\n而等等會展示一些測資來凸顯線段樹省時的威力\n{以下是功能的代表色}\n"}},{{"{query}   (查詢)"},"rgba(18, 221, 35, 0.7)"} },0,-240);
    av.frame_draw("tree" , 0,   0,   tree, {{{"focus"},_draw_focus} }, {1,n}, "segment_tree", 20, 1, lazy, sets);
    av.end_frame_draw();
    //}
    
    vector<int> X={13,1,2,1,8,2,8}, Y={14,2,15,15,8,3,9};
    for(int i=0;i<X.size();i++){
        int x=X[i], y=Y[i];
        /*
        cin>>q>>x>>y;
        if(q!=3)cin>>k;
        */
        //draw{
        _draw_segment[0].clear();
        _draw_segment[1].clear();
        _draw_segment[2].clear();

        _draw_segment[0].pb(1);
        _draw_segment[1].pb(x-1);
        _draw_segment[2].pb(y);

        _draw_seg_color="rgba(18, 221, 35, 0.7)";
        
        av.start_frame_draw();
        av.colored_text({{{"{這個是 }"}},{{"{query 的操作}"},"rgba(18, 221, 35, 0.44)"},{{"\n現在"}},{{"搜尋區間 "+to_string(x)+"~"+to_string(y)+" 的數值"},"rgba(18, 221, 35, 0.44)"}},0,-80);
        av.frame_draw("tree" , 0,   0,   tree, {{{"focus"},_draw_focus}, {{"seg_bg",_draw_seg_color},{}} }, {1,n}, "segment_tree", 20, 1, lazy, sets, _draw_segment[0], _draw_segment[1], _draw_segment[2]);
        av.key_frame_draw("tree" , 0,   0,   tree, {{{"focus"},_draw_focus} }, {1,n}, "segment_tree", 20, 1, lazy, sets, _draw_segment[0], _draw_segment[1], _draw_segment[2]);
        av.end_frame_draw();
        //}
        int ans = query(Tmask, (Tmask<<1)-1, (x-1|Tmask), (y-1|Tmask));
        cout<<ans<<endl;  

        //draw{
        av.start_frame_draw();
        av.colored_text({{{"完成一次 "}},{{"query 的操作\n"},"rgba(18, 221, 35, 0.44)"},{{"區間搜尋結果 "+to_string(x)+"~"+to_string(y)+" 的數值為 "+to_string(ans)},"rgba(18, 221, 35, 0.44)"}},0,-80);
        av.frame_draw("tree" , 0,   0,   tree, {{{"focus"},_draw_focus}, {{"seg_bg",_draw_seg_color},{}} }, {1,n}, "segment_tree", 20, 1, lazy, sets, _draw_segment[0], _draw_segment[1], _draw_segment[2]);
        av.key_frame_draw("tree" , 0,   0,   tree, {{{"focus"},_draw_focus}, {{"seg_bg",_draw_seg_color},{}} }, {1,n}, "segment_tree", 20, 1, lazy, sets, _draw_segment[0], _draw_segment[1], _draw_segment[2]);
        av.end_frame_draw();
        //}   
    }
    //draw{
    av.start_frame_draw();
    av.frame_draw("tree" , 0,   0,       tree, {{{"focus"},_draw_focus}, {{"seg_bg",_draw_seg_color},{}} }, {1,n}, "segment_tree", 20, 1, lazy, sets, vector<int>(), vector<int>(), vector<int>());
    av.end_frame_draw();
    av.end_draw();
    //}
}
/*
15 7
1 2 3 4 5 6 7 8 9 10 11 12 13 14 15
1 13 14 1
1 1 2 2
2 2 15 3
1 1 15 4
2 8 8 5
1 2 3 6
3 8 9
*/