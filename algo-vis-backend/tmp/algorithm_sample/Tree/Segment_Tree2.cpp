//Segment_Tree2 Sample
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
vector<int> _draw_lazy, _draw_sets, _draw_focus, _draw_lazy_tmp, _draw_sets_tmp;
vector<string> _draw_modify;
vector<vector<int>> _draw_segment(3,vector<int>());
string _draw_seg_color;
//}

int rule(int a, int b){
    return a+b;
}
void build(){
    Tmask=1<<Hbit(n-1), Tsize=Tmask+n, Tdeep=Hbit(n-1)+1;
    tree.assign(1<<Tdeep,0); //如果要改成min的話 0要改成LM
    lazy.assign(1<<Tdeep,0); 
    sets.assign(1<<Tdeep,LM); 
    //draw{
    _draw_lazy_tmp.assign(1<<Tdeep,0);
    _draw_sets_tmp.assign(1<<Tdeep,LM);
    //}
//    for(int i=Tsize-n;i<Tsize;i++)cin>>tree[i];
    for(int i=Tsize-n;i<Tsize;i++)tree[i]=Tsize-i;
    for(int i=Tsize-n-1;i>0;i--)tree[i]= rule(tree[i<<1],tree[i<<1|1]); //改變建樹規則要注意這
}
//query就放前4個值 Add就放前五個值 set就前六個Add放0  前四個放Tmask, (Tmask<<1)-1, (x|Tmask), (y|Tmask) 0(base)
int query(int l,int r,int L,int R,int Add=0,int Set=LM,int now=1){ //如果要改成min的話 Add要改成LM
    if(L<=l && r<=R){ //所有尾端的節點 必須在這處理並停止
        if(Set!=LM){
            //draw{
            _draw_lazy.clear(); for(int i=1;i<Tsize;i++) if(lazy[i]!= 0)_draw_lazy.pb(i);
            _draw_sets.clear(); for(int i=1;i<Tsize;i++) if(sets[i]!=LM)_draw_sets.pb(i);
            _draw_modify = AV::array_int_to_string(tree);
            for(int i=1;i<Tsize;i++) if(lazy[i]!= 0) _draw_modify[i] = to_string(tree[i]) + "," + to_string(lazy[i]);
            for(int i=1;i<Tsize;i++) if(sets[i]!=LM) _draw_modify[i] = to_string(tree[i]) + "," + to_string(lazy[i]) + "," + to_string(sets[i]);
            av.start_frame_draw(); 
            av.colored_text({{{"如果有"}},{{"modify標記"},"rgba(231, 144, 255, 0.7)"},{{" 那就將其覆蓋掉\n否則直接寫入就好"}}},0,-80);   
            av.frame_draw("tree" , 0,   0, _draw_modify, {{{"highlight"},{now}}, {{"focus"},_draw_focus}, {{"point"},{now}}, {{"background"},_draw_lazy}, {{"background","rgba(255, 162, 0, 1)"},_draw_sets}, {{"seg_bg",_draw_seg_color},{}} }, {1,n}, "segment_tree", 20, 1, vector<int>(), vector<int>(), _draw_segment[0], _draw_segment[1], _draw_segment[2]);
            av.end_frame_draw();
            //}
            sets[now]=Set; 		   //尾端設置sets
            tree[now]=(r-l+1)*Set; //尾端設置tree
            lazy[now]=0;		   //set優先級>add 因此必須將其動作抹去
        }
        if(Add!=0){
            if(sets[now]!=LM) {
                sets[now]+=Add, tree[now] =(r-l+1)*sets[now];
                //draw{
                _draw_lazy.clear(); for(int i=1;i<Tsize;i++) if(lazy[i]!= 0)_draw_lazy.pb(i);
                _draw_sets.clear(); for(int i=1;i<Tsize;i++) if(sets[i]!=LM)_draw_sets.pb(i);
                _draw_modify = AV::array_int_to_string(tree);
                for(int i=1;i<Tsize;i++) if(lazy[i]!= 0) _draw_modify[i] = to_string(tree[i]) + "," + to_string(lazy[i]);
                for(int i=1;i<Tsize;i++) if(sets[i]!=LM) _draw_modify[i] = to_string(tree[i]) + "," + to_string(lazy[i]) + "," + to_string(sets[i]);
                av.start_frame_draw(); 
                av.colored_text({{{"因為有"}},{{"set標記"},"rgba(255, 162, 0, 0.7)"},{{"所以要將"}},{{"modify的值"},"rgba(231, 144, 255, 0.7)"},{{"直接加在"}},{{"set標記"},"rgba(255, 162, 0, 0.7)"},{{"上"}}},0,-60);   
                av.frame_draw("tree" , 0,   0, _draw_modify, {{{"highlight"},{now}}, {{"focus"},_draw_focus}, {{"point"},{now}}, {{"background"},_draw_lazy}, {{"background","rgba(255, 162, 0, 1)"},_draw_sets}, {{"seg_bg",_draw_seg_color},{}} }, {1,n}, "segment_tree", 20, 1, vector<int>(), vector<int>(), _draw_segment[0], _draw_segment[1], _draw_segment[2]);
                av.end_frame_draw();
                //}
            }
            //因為已經set過了 所以這一段的值會是均勻的 因此不需要將lazy再往下傳 直接加在set上算長度就好
            else lazy[now]+=Add, tree[now]+=(r-l+1)*Add;	
            //需要繼續將lazy往下傳 才能判斷更底下的情況
        }
        if(l==r)lazy[now]=0,sets[now]=LM;
        //draw{
        _draw_lazy.clear(); for(int i=1;i<Tsize;i++) if(lazy[i]!= 0)_draw_lazy.pb(i);
        _draw_sets.clear(); for(int i=1;i<Tsize;i++) if(sets[i]!=LM)_draw_sets.pb(i);
        _draw_modify = AV::array_int_to_string(tree);
        for(int i=1;i<Tsize;i++) if(lazy[i]!= 0) _draw_modify[i] = to_string(tree[i]) + "," + to_string(lazy[i]);
        for(int i=1;i<Tsize;i++) if(sets[i]!=LM) _draw_modify[i] = to_string(tree[i]) + "," + to_string(lazy[i]) + "," + to_string(sets[i]);
        for(int i=0;i<_draw_segment[0].size();i++) {
            if(_draw_segment[0][i]==now) {
                _draw_segment[0].erase(_draw_segment[0].begin()+i);
                _draw_segment[1].erase(_draw_segment[1].begin()+i);
                _draw_segment[2].erase(_draw_segment[2].begin()+i);
                break;
            }
        }
        av.start_frame_draw();
        av.colored_text({{{"{直到區段遇到剛好符合它大小的區段後就把它}標記一下\n{同時修改維護線段樹本身的值}\n{如果是最底下的話就不需要標記直接修改線段樹的數值即可}\n"}},{{"(粉色區段的意思是儲存當前區段以下每個區段都要加上某個數值的標記   方格中的第2個數值)"},"rgba(231, 144, 255, 0.7)"},{{"\n"}},{{"(橘色區段的意思是儲存當前區段以下每個區段都要設置成某個數值的標記 方格中的第3個數值)"},"rgba(255, 162, 0, 0.7)"}},0,-140);   
        av.frame_draw("tree" , 0,   0,   _draw_modify, {{{"highlight"},{now}}, {{"focus"},_draw_focus}, {{"point"},{now}}, {{"background"},_draw_lazy}, {{"background","rgba(255, 162, 0, 1)"},_draw_sets}, {{"seg_bg",_draw_seg_color},{}} }, {1,n}, "segment_tree", 20, 1, vector<int>(), vector<int>(), _draw_segment[0], _draw_segment[1], _draw_segment[2]);
        av.key_frame_draw("tree" , 0,   0,   tree, {{{"highlight"},{now}}, {{"focus"},_draw_focus}, {{"point"},{now}}, {{"background"},_draw_lazy}, {{"background","rgba(255, 162, 0, 1)"},_draw_sets}, {{"seg_bg",_draw_seg_color},{}} }, {1,n}, "segment_tree", 20, 1, lazy, sets, _draw_segment[0], _draw_segment[1], _draw_segment[2]);
        av.end_frame_draw();
        //}
        return tree[now]; 
    }
    //因為區間最少就是1 不會跑到這下面 讓尋找子節點的過程超界 因此不需要開到4*n記憶體
    int m=(l+r)>>1,M=r-m, sum=0; //如果要改成min的話 sum要改成LM
    //我的樹左邊跟右邊的區段一定是一樣的 所以直接r-m就好
    if(sets[now]!=LM){ //set優先處理
        
        //draw{
        _draw_lazy.clear(); for(int i=1;i<Tsize;i++) if(lazy[i]!= 0)_draw_lazy.pb(i);
        _draw_sets.clear(); for(int i=1;i<Tsize;i++) if(sets[i]!=LM)_draw_sets.pb(i);
        _draw_modify = AV::array_int_to_string(tree);
        for(int i=1;i<Tsize;i++) if(lazy[i]!= 0) _draw_modify[i] = to_string(tree[i]) + "," + to_string(lazy[i]);
        for(int i=1;i<Tsize;i++) if(sets[i]!=LM) _draw_modify[i] = to_string(tree[i]) + "," + to_string(lazy[i]) + "," + to_string(sets[i]);
        av.start_frame_draw(); 
        av.colored_text({{{"遇到當前區段有標記時必須先處理原來的標記才能在處理現在的標記\n這邊是處理當前區段已經有 "}},{{"set 標記"},"rgba(255, 162, 0, 0.7)"},{{"的情況"}}},0,-80);   
        av.frame_draw("tree" , 0,   0, _draw_modify, {{{"highlight"},{now}}, {{"focus"},_draw_focus}, {{"point"},{now}}, {{"background"},_draw_lazy}, {{"background","rgba(255, 162, 0, 1)"},_draw_sets}, {{"seg_bg",_draw_seg_color},{}} }, {1,n}, "segment_tree", 20, 1, vector<int>(), vector<int>(), _draw_segment[0], _draw_segment[1], _draw_segment[2]);
        av.end_frame_draw();
        //}

        sets[now<<1]=sets[now<<1|1]=sets[now];	 
        tree[now<<1]=tree[now<<1|1]=tree[now]/2; //把總和分一半給兩邊
        lazy[now<<1]=lazy[now<<1|1]=0;			 //因為set優先於lazy所以要將lazy全部抹除
        sets[now]=LM;

        //draw{
        _draw_lazy.clear(); for(int i=1;i<Tsize;i++) if(lazy[i]!= 0)_draw_lazy.pb(i);
        _draw_sets.clear(); for(int i=1;i<Tsize;i++) if(sets[i]!=LM)_draw_sets.pb(i);
        _draw_modify = AV::array_int_to_string(tree);
        for(int i=1;i<Tsize;i++) if(lazy[i]!= 0) _draw_modify[i] = to_string(tree[i]) + "," + to_string(lazy[i]);
        for(int i=1;i<Tsize;i++) if(sets[i]!=LM) _draw_modify[i] = to_string(tree[i]) + "," + to_string(lazy[i]) + "," + to_string(sets[i]);
        av.start_frame_draw();
        av.colored_text({{{"先將原來的標記往下推之後\n如果底下有 "}},{{"modify 標記"},"rgba(231, 144, 255, 0.7)"},{{"的話\n"}},{{"set標記"},"rgba(255, 162, 0, 0.7)"},{{"會將"}},{{"modify標記"},"rgba(231, 144, 255, 0.7)"},{{"覆蓋掉\n否則直接將標記往下推就好"}}},0,-120);   
        av.frame_draw("tree" , 0,   0, _draw_modify, {{{"highlight"},{now}}, {{"focus"},_draw_focus}, {{"point"},{now}}, {{"background"},_draw_lazy}, {{"background","rgba(255, 162, 0, 1)"},_draw_sets}, {{"seg_bg",_draw_seg_color},{}} }, {1,n}, "segment_tree", 20, 1, vector<int>(), vector<int>(), _draw_segment[0], _draw_segment[1], _draw_segment[2]);
        av.end_frame_draw();
        //}
    }
    if(lazy[now]!=0){ 
        
        //draw{
        _draw_lazy.clear(); for(int i=1;i<Tsize;i++) if(lazy[i]!= 0)_draw_lazy.pb(i);
        _draw_sets.clear(); for(int i=1;i<Tsize;i++) if(sets[i]!=LM)_draw_sets.pb(i);
        _draw_modify = AV::array_int_to_string(tree);
        for(int i=1;i<Tsize;i++) if(lazy[i]!= 0) _draw_modify[i] = to_string(tree[i]) + "," + to_string(lazy[i]);
        for(int i=1;i<Tsize;i++) if(sets[i]!=LM) _draw_modify[i] = to_string(tree[i]) + "," + to_string(lazy[i]) + "," + to_string(sets[i]);
        av.start_frame_draw(); 
        av.colored_text({{{"遇到當前區段有標記時必須先處理原來的標記才能在處理現在的標記\n這邊是處理當前區段已經有 "}},{{"modify 標記"},"rgba(231, 144, 255, 0.7)"},{{"的情況"}}},0,-80);
        av.frame_draw("tree" , 0,   0, _draw_modify, {{{"highlight"},{now}}, {{"focus"},_draw_focus}, {{"point"},{now}}, {{"background"},_draw_lazy}, {{"background","rgba(255, 162, 0, 1)"},_draw_sets}, {{"seg_bg",_draw_seg_color},{}} }, {1,n}, "segment_tree", 20, 1, vector<int>(), vector<int>(), _draw_segment[0], _draw_segment[1], _draw_segment[2]);
        av.end_frame_draw();
        //}
        
        if(sets[now<<1  ]!=LM) sets[now<<1  ]+=lazy[now], tree[now<<1  ] =M*sets[now<<1  ];
        else                   lazy[now<<1  ]+=lazy[now], tree[now<<1  ]+=M*lazy[now<<1  ];
        if(sets[now<<1|1]!=LM) sets[now<<1|1]+=lazy[now], tree[now<<1|1] =M*sets[now<<1|1];
        else                   lazy[now<<1|1]+=lazy[now], tree[now<<1|1]+=M*lazy[now<<1|1];
        lazy[now]=0;

        //draw{
        _draw_lazy.clear(); for(int i=1;i<Tsize;i++) if(lazy[i]!= 0)_draw_lazy.pb(i);
        _draw_sets.clear(); for(int i=1;i<Tsize;i++) if(sets[i]!=LM)_draw_sets.pb(i);
        _draw_modify = AV::array_int_to_string(tree);
        for(int i=1;i<Tsize;i++) if(lazy[i]!= 0) _draw_modify[i] = to_string(tree[i]) + "," + to_string(lazy[i]);
        for(int i=1;i<Tsize;i++) if(sets[i]!=LM) _draw_modify[i] = to_string(tree[i]) + "," + to_string(lazy[i]) + "," + to_string(sets[i]);
        av.start_frame_draw();
        av.colored_text({{{"先將原來的標記往下推之後\n如果底下有 "}},{{"set 標記"},"rgba(255, 162, 0, 0.7)"},{{"的話\n"}},{{"modify 標記"},"rgba(231, 144, 255, 0.7)"},{{"會直接加在 "}},{{"set 標記"},"rgba(255, 162, 0, 0.7)"},{{"上\n否則直接將標記往下推就好"}}},0,-120);  
        av.frame_draw("tree" , 0,   0, _draw_modify, {{{"highlight"},{now}}, {{"focus"},_draw_focus}, {{"point"},{now}}, {{"background"},_draw_lazy}, {{"background","rgba(255, 162, 0, 1)"},_draw_sets}, {{"seg_bg",_draw_seg_color},{}} }, {1,n}, "segment_tree", 20, 1, vector<int>(), vector<int>(), _draw_segment[0], _draw_segment[1], _draw_segment[2]);
        av.end_frame_draw();
        //}
    }

    //draw{
    _draw_lazy.clear(); for(int i=1;i<Tsize;i++) if(lazy[i]!= 0)_draw_lazy.pb(i);
    _draw_sets.clear(); for(int i=1;i<Tsize;i++) if(sets[i]!=LM)_draw_sets.pb(i);
    _draw_modify = AV::array_int_to_string(tree);
    for(int i=1;i<Tsize;i++) if(lazy[i]!= 0) _draw_modify[i] = to_string(tree[i]) + "," + to_string(lazy[i]);
    for(int i=1;i<Tsize;i++) if(sets[i]!=LM) _draw_modify[i] = to_string(tree[i]) + "," + to_string(lazy[i]) + "," + to_string(sets[i]);
    av.start_frame_draw();
    av.text("{從最上面一路往下遞迴:一路遞迴拆下去}\n{並且遇到中線就將它二分後拆分推下去}",0,-80);
    av.frame_draw("tree" , 0,   0, _draw_modify, {{{"highlight"},{now}}, {{"focus"},_draw_focus}, {{"point"},{now}}, {{"background"},_draw_lazy}, {{"background","rgba(255, 162, 0, 1)"},_draw_sets}, {{"seg_bg",_draw_seg_color},{}} }, {1,n}, "segment_tree", 20, 1, vector<int>(), vector<int>(), _draw_segment[0], _draw_segment[1], _draw_segment[2]);
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

    if(L<=m)sum=rule(sum,query(l  , m, L, R, Add, Set, now<<1  )); 
    if(R> m)sum=rule(sum,query(m+1, r, L, R, Add, Set, now<<1|1));
    
    //draw{
    vector<string> _draw_modify = AV::array_int_to_string(tree);
    _draw_modify[now] = to_string(tree[now<<1]) + "+" + to_string(tree[now<<1|1]);
    av.start_frame_draw();
    av.text("{一路遞迴往上}修正{回去}",0,-60);
    av.frame_draw("tree" , 0,   0, _draw_modify, {{{"highlight"},{now}}, {{"focus"},_draw_focus}, {{"point"},{now}}, {{"background"},_draw_lazy}, {{"background","rgba(255, 162, 0, 1)"},_draw_sets}, {{"seg_bg",_draw_seg_color},{}} }, {1,n}, "segment_tree", 20, 1, lazy, sets, _draw_segment[0], _draw_segment[1], _draw_segment[2]);
    av.end_frame_draw();
    //}

    tree[now]=rule(tree[now<<1],tree[now<<1|1]);

    //draw{
    av.start_frame_draw();
    av.text("{一路遞迴往上}修正{回去}",0,-60);
    av.frame_draw("tree" , 0,   0, tree, {{{"highlight"},{now}}, {{"focus"},_draw_focus}, {{"point"},{now}}, {{"background"},_draw_lazy}, {{"background","rgba(255, 162, 0, 1)"},_draw_sets}, {{"seg_bg",_draw_seg_color},{}} }, {1,n}, "segment_tree", 20, 1, lazy, sets, _draw_segment[0], _draw_segment[1], _draw_segment[2]);
    av.end_frame_draw();
    //}

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
    av.colored_text({{{"這是一顆線段樹\n每一層皆是由底下兩層相加而來的\n最底下一行是輸入的測資\n在建樹的時候先輸入測資後再一路往上建構出來的\n而等等會展示一些測資來凸顯線段樹省時的威力\n{而最常見的線段樹操作就是}\n"}},{{"{query}   (查詢)"},"rgba(18, 221, 35, 0.7)"},{{"\n"}},{{"{modify} (全部加上某一數值)"},"rgba(231, 144, 255, 0.7)"},{{"\n"}},{{"{set}        (全部設置成某一數值)"},"rgba(255, 162, 0, 0.7)"}},0,-240);
    av.frame_draw("tree" , 0,   0,   tree, {{{"focus"},_draw_focus} }, {1,n}, "segment_tree", 20, 1, lazy, sets);
    av.end_frame_draw();
    //}
    
    vector<int> Q={1,1,2,1,2,1,3}, X={13,1,2,1,8,2,8}, Y={14,2,15,15,8,3,9}, K={1,2,3,4,5,6,7};

    for(int i=0;i<Q.size();i++){
        int q=Q[i], x=X[i], y=Y[i], k=K[i];
        /*
        cin>>q>>x>>y;
        if(q!=3)cin>>k;
        */
        //draw{
        _draw_lazy.clear(); for(int i=1;i<Tsize;i++) if(lazy[i]!= 0)_draw_lazy.pb(i);
        _draw_sets.clear(); for(int i=1;i<Tsize;i++) if(sets[i]!=LM)_draw_sets.pb(i);

        _draw_segment[0].clear();
        _draw_segment[1].clear();
        _draw_segment[2].clear();

        _draw_segment[0].pb(1);
        _draw_segment[1].pb(x-1);
        _draw_segment[2].pb(y);

             if(q==1)_draw_seg_color="rgba(231, 144, 255, 0.7)";
        else if(q==2)_draw_seg_color="rgba(255, 162, 0, 0.7)";
        else         _draw_seg_color="rgba(18, 221, 35, 0.7)";
        
        av.start_frame_draw();
             if(q==1) av.colored_text({{{"{這個是 }"}},{{"{modify 的操作}"},"rgba(231, 144, 255, 0.44)"},{{"\n現在要往"}},{{"區間 "+to_string(x)+"~"+to_string(y)+" 全部加上 "+to_string(k)},"rgba(231, 144, 255, 0.44)"}},0,-80);
        else if(q==2) av.colored_text({{{"{這個是 }"}},{{"{set 的操作}"},"rgba(255, 162, 0, 0.44)"},{{"\n現在要往"}},{{"區間 "+to_string(x)+"~"+to_string(y)+" 全部設定成 "+to_string(k)},"rgba(255, 162, 0, 0.44)"}},0,-80);
        else          av.colored_text({{{"{這個是 }"}},{{"{query 的操作}"},"rgba(18, 221, 35, 0.44)"},{{"\n現在"}},{{"搜尋區間 "+to_string(x)+"~"+to_string(y)+" 的數值"},"rgba(18, 221, 35, 0.44)"}},0,-80);
        av.frame_draw("tree"     , 0,   0,   tree, {{{"focus"},_draw_focus}, {{"background"},_draw_lazy}, {{"background","rgba(255, 162, 0, 1)"},_draw_sets}, {{"seg_bg",_draw_seg_color},{}} }, {1,n}, "segment_tree", 20, 1, lazy, sets, _draw_segment[0], _draw_segment[1], _draw_segment[2]);
        av.key_frame_draw("tree" , 0,   0,   tree, {{{"focus"},_draw_focus}, {{"background"},_draw_lazy}, {{"background","rgba(255, 162, 0, 1)"},_draw_sets}, {{"seg_bg",_draw_seg_color},{}} }, {1,n}, "segment_tree", 20, 1, lazy, sets, _draw_segment[0], _draw_segment[1], _draw_segment[2]);
        av.end_frame_draw();
        //}
        int ans;
             if(q==1)query(Tmask, (Tmask<<1)-1, (x-1|Tmask), (y-1|Tmask), k);
        else if(q==2)query(Tmask, (Tmask<<1)-1, (x-1|Tmask), (y-1|Tmask), 0, k);
        else   ans = query(Tmask, (Tmask<<1)-1, (x-1|Tmask), (y-1|Tmask)), cout<<ans<<endl;  

        //draw{
        av.start_frame_draw();
             if(q==1) av.colored_text({{{"完成一次 "}},{{"modify 的操作"},"rgba(231, 144, 255, 0.44)"}},0,-60);
        else if(q==2) av.colored_text({{{"完成一次 "}},{{"set 的操作"},"rgba(255, 162, 0, 0.44)"}},0,-60);
        else          av.colored_text({{{"完成一次 "}},{{"query 的操作\n"},"rgba(18, 221, 35, 0.44)"},{{"區間搜尋結果 "+to_string(x)+"~"+to_string(y)+" 的數值為 "+to_string(ans)},"rgba(18, 221, 35, 0.44)"}},0,-80);
        av.frame_draw("tree"     , 0,   0,   tree, {{{"focus"},_draw_focus}, {{"background"},_draw_lazy}, {{"background","rgba(255, 162, 0, 1)"},_draw_sets}, {{"seg_bg",_draw_seg_color},{}} }, {1,n}, "segment_tree", 20, 1, lazy, sets, _draw_segment[0], _draw_segment[1], _draw_segment[2]);
        av.key_frame_draw("tree" , 0,   0,   tree, {{{"focus"},_draw_focus}, {{"background"},_draw_lazy}, {{"background","rgba(255, 162, 0, 1)"},_draw_sets}, {{"seg_bg",_draw_seg_color},{}} }, {1,n}, "segment_tree", 20, 1, lazy, sets, _draw_segment[0], _draw_segment[1], _draw_segment[2]);
        av.end_frame_draw();
        //}   
    }
    //draw{
    av.start_frame_draw();
    av.frame_draw("tree" , 0,   0,       tree, {{{"focus"},_draw_focus}, {{"background"},_draw_lazy}, {{"background","rgba(255, 162, 0, 1)"},_draw_sets}, {{"seg_bg",_draw_seg_color},{}} }, {1,n}, "segment_tree", 20, 1, lazy, sets, vector<int>(), vector<int>(), vector<int>());
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