// AV.hpp
#ifndef AV_HPP
#define AV_HPP

#include <string>
#include <vector>
#include <fstream>
#include <iostream>
#include <sstream>
#include <stack>
#include <queue>
#include <set>
#include <cstdlib>
#include <cmath>
#include <map>
#include <iomanip>
#include <functional>
#include <type_traits>
using namespace std;

// ===== AV 視覺系統常用顏色常數 =====
const string AV_green      = "AV_green";
const string AV_blue       = "AV_blue";
const string AV_red        = "AV_red";
const string AV_yellow     = "AV_yellow";
const string AV_orange     = "AV_orange";

const string AV_node_green = "AV_node_green";
const string AV_node_red   = "AV_node_red";
const string AV_grey       = "AV_grey";
const string AV_node_grey  = "AV_node_grey";
const string AV_black      = "AV_black";
const string AV_white      = "AV_white";

using array_style = pair<vector<string>, vector<int>>;
using array2D_style = pair<vector<string>, vector<pair<int,int>>>;

// 類型檢查：如果是 vector<vector<T>>，則 T 會被匹配為 vector<int> 等
// 我們要排除 1D 版本 match 到 vector 的情況
template<typename T> struct is_vector : std::false_type {};
template<typename T, typename A> struct is_vector<std::vector<T, A>> : std::true_type {};

struct Pos {
    bool isRelative;
    int index;          // 1D 索引 (-1 代表整個物件)
    int row, col;       // 2D 索引 (-1 代表整個物件)
    double x, y;        // 絕對座標 或 相對偏移量 (dx, dy)
    string refId;       // 目標物件 ID
    string anchor;      // 錨點方位

    // 建構子 1: 絕對位置 (x, y)
    Pos(int _x, int _y) 
        : x((double)_x), y((double)_y), isRelative(false), index(-1), row(-1), col(-1), refId(""), anchor("") {}

    Pos(double _x, double _y) 
        : x(_x), y(_y), isRelative(false), index(-1), row(-1), col(-1), refId(""), anchor("") {}

    // 建構子 2: 相對位置 - 鎖定「整個物件」
    // 用法: Pos("array", "top") 或 Pos("array")
    Pos(string _id, string _anchor = "center", double _dx = 0, double _dy = 0) 
        : refId(_id), anchor(_anchor), x(_dx), y(_dy), index(-1), row(-1), col(-1), isRelative(true) {}

    // 建構子 3: 相對位置 - 鎖定「1D 格子」
    // 用法: Pos("array", 5, "top") -> 鎖定 index 5
    Pos(string _id, int _index, string _anchor = "center", double _dx = 0, double _dy = 0) 
        : refId(_id), index(_index), anchor(_anchor), x(_dx), y(_dy), row(-1), col(-1), isRelative(true) {}

    // 建構子 4: 相對位置 - 鎖定「2D 格子」 (新增!)
    // 用法: Pos("matrix", 1, 2, "top") -> 鎖定 row 1, col 2
    Pos(string _id, int _row, int _col, string _anchor = "center", double _dx = 0, double _dy = 0) 
        : refId(_id), row(_row), col(_col), anchor(_anchor), x(_dx), y(_dy), index(-1), isRelative(true) {}

    string toJson() const {
        stringstream ss;
        ss << "{";
        if (isRelative) {
            ss << "\"type\":\"rel\",";
            ss << "\"ref\":\"" << refId << "\",";
            
            // 根據不同模式輸出對應的索引
            if (row != -1 && col != -1) {
                ss << "\"row\":" << row << ",";
                ss << "\"col\":" << col << ",";
            } else if (index != -1) {
                ss << "\"index\":" << index << ",";
            }

            ss << "\"anchor\":\"" << anchor << "\",";
            ss << "\"dx\":" << x << ",";
            ss << "\"dy\":" << y;
        } else {
            ss << "\"type\":\"abs\",";
            ss << "\"x\":" << x << ",";
            ss << "\"y\":" << y;
        }
        ss << "}";
        return ss.str();
    }
};

class AV; // 前向宣告以利 TreeLayout 使用

class AV {
public:
    friend struct TreeLayout;
    AV() : _frameCount(0) {
        // 嘗試讀取環境變數
        const char* env_p = getenv("AV_OUTPUT_FILE");
        if (env_p) {
            _outPath = string(env_p);
        } else {
            // 本機測試時的預設值
            _outPath = "public/code_script.js";
        }
    }

    #define draw(...)             draw_impl(__LINE__, __VA_ARGS__)
    #define draw_array(groupID, pos, ...) frame_draw_impl(__LINE__, groupID, pos, __VA_ARGS__)
    #define draw_2Darray(groupID, pos, ...) frame_draw_impl(__LINE__, groupID, pos, __VA_ARGS__)
    #define frame_draw(groupID, pos, ...) frame_draw_impl(__LINE__, groupID, pos, __VA_ARGS__)
    #define key_frame_draw(groupID, pos, ...) key_frame_draw_impl(__LINE__, groupID, pos, __VA_ARGS__)
    #define draw_stack(groupID, pos, s, ...) frame_draw_impl(__LINE__, groupID, pos, AV::to_vector(s), __VA_ARGS__, "stack")
    #define draw_queue(groupID, pos, q, ...) frame_draw_impl(__LINE__, groupID, pos, AV::to_vector(q), __VA_ARGS__, "queue")
    #define camera(...)           camera_impl(__VA_ARGS__)
    #define auto_camera(...)      auto_camera_impl(__VA_ARGS__)

    #define text(...)             text_impl(__LINE__, __VA_ARGS__)
    #define key_text(...)         key_text_impl(__LINE__, __VA_ARGS__)
    #define colored_text(...)     colored_text_impl(__LINE__, __VA_ARGS__)
    #define key_colored_text(...) key_colored_text_impl(__LINE__, __VA_ARGS__)
    #define arrow(...)            arrow_impl(__LINE__, __VA_ARGS__)
    #define key_arrow(...)        key_arrow_impl(__LINE__, __VA_ARGS__)

    // accu_store 已包含 __LINE__，當作指令儲存時自動記錄呼叫位置的行號
    #define accu_store(...)        accu_store_impl(__LINE__, __VA_ARGS__)
    #define accu_store_colored(...)  accu_store_colored_impl(__LINE__, __VA_ARGS__)
    #define accu_store_arrow(...)  accu_store_arrow_impl(__LINE__, __VA_ARGS__)
    #define accu_store_2D(...)     accu_store_2D_impl(__LINE__, __VA_ARGS__)
    #define draw_circle(circleID, pos, value, ...) draw_circle_impl(__LINE__, circleID, pos, value, ##__VA_ARGS__)
    #define key_draw_circle(circleID, pos, value, ...) key_draw_circle_impl(__LINE__, circleID, pos, value, ##__VA_ARGS__)
    #define accu_store_circle(circleID, pos, value, ...) accu_store_circle_impl(__LINE__, circleID, pos, value, ##__VA_ARGS__)
    #define draw_word(text, pos)  draw_word_impl(__LINE__, text, pos)
    #define key_draw_word(text, pos)  key_draw_word_impl(__LINE__, text, pos)
    #define accu_store_word(text, pos) accu_store_word_impl(__LINE__, text, pos)
    #define draw_triangle(id, pos, h, w, ...) draw_triangle_impl(__LINE__, id, pos, h, w, ##__VA_ARGS__)
    #define key_draw_triangle(id, pos, h, w, ...) key_draw_triangle_impl(__LINE__, id, pos, h, w, ##__VA_ARGS__)
    #define accu_store_triangle(id, pos, h, w, ...) accu_store_triangle_impl(__LINE__, id, pos, h, w, ##__VA_ARGS__)
    #define sleep(ms)             sleep_impl(ms)

    //AtoB function : return a A~B increase vector
    static vector<int> AtoB(int start, int end) {
        vector<int> v;
        if (end >= start) {
            v.reserve(end - start + 1);
            for (int i = start; i <= end; ++i) {
                v.push_back(i);
            }
        }
        return v;
    }

    static vector<pair<int,int>> AtoB(int start_x, int start_y, int end_x, int end_y) {
        vector<pair<int,int>> tmp;
        for(int i=start_x;i<=end_x;i++)for(int j=start_y;j<=end_y;j++) tmp.push_back({i,j});
        return tmp;
    }

    static vector<vector<int>> to_2Darray(const vector<int>& arr, int L = -1, int R = -1, int l = -1, int r = -1) {
        if (arr.empty()) return {};
        if (L == -1) L = 0;
        if (R == -1) R = (int)arr.size() - 1;
        
        if (l == -1 || r == -1) {
            int max_val = 0;
            for (int x : arr) if (x > max_val) max_val = x;
            int high_bit = 0;
            for (int b = 31; b >= 0; b--) {
                if ((max_val >> b) & 1) {
                    high_bit = b;
                    break;
                }
            }
            // 預設由最高位元 (l) 到最低位元 (r=0)
            if (l == -1) l = high_bit;
            if (r == -1) r = 0;
        }

        vector<vector<int>> res;
        for (int i = L; i <= R; ++i) {
            if (i < 0 || i >= (int)arr.size()) continue;
            vector<int> row;
            if (l <= r) {
                for (int j = l; j <= r; ++j) row.push_back((arr[i] >> j) & 1);
            } else {
                for (int j = l; j >= r; --j) row.push_back((arr[i] >> j) & 1);
            }
            res.push_back(row);
        }
        return res;
    }

    static vector<char> string_to_char_array(const string& arr) {
        vector<char> tmp(arr.size());
        for(int i=0;i<arr.size();i++) tmp[i]=arr[i];
        return tmp;
    }

    template<typename T>
    static vector<string> array_int_to_string(const vector<T>& arr) {
        vector<string> tmp(arr.size());
        for(int i=0;i<arr.size();i++) {
            ostringstream oss;
            oss << arr[i];
            tmp[i] = oss.str();
        }
        return tmp;
    }

    template<typename T>
    static string array_to_string(const vector<T>& arr) {
        ostringstream oss;
        oss << "[";
        for (size_t i = 0; i < arr.size(); i++) {
            if (i) oss << ",";
            oss << arr[i];
        }
        oss << "]";
        return oss.str();
    }

    static string array_to_string(const vector<string>& arr) {
        ostringstream oss;
        oss << "[";
        for (size_t i = 0; i < arr.size(); i++) {
            if (i) oss << ",";
            oss << "\'" << arr[i] << "\'";
        }
        oss << "]";
        return oss.str();
    }

    static string array_to_string(const vector<char>& arr) {
        ostringstream oss;
        oss << "[";
        for (size_t i = 0; i < arr.size(); i++) {
            if (i) oss << ",";
            oss << "\'" << arr[i] << "\'";
        }
        oss << "]";
        return oss.str();
    }

    template<typename T, typename U>
    static string array_to_string(const vector<pair<T,U>>& arr) {
        ostringstream oss;
        oss << "[";
        for (size_t i = 0; i < arr.size(); i++) {
            if (i) oss << ",";
            oss << "[" << arr[i].first << "," << arr[i].second << "]";
        }
        oss << "]";
        return oss.str();
    }

    template<typename T>
    static string array2D_to_string(const vector<vector<T>>& arr) {
        ostringstream oss;
        oss << "[";
        for (size_t i = 0; i < arr.size(); i++) {
            if (i) oss << ",";
            oss << array_to_string(arr[i]); 
        }
        oss << "]";
        return oss.str();
    }

    template<typename T, typename U>
    static string array2D_to_string(const vector<pair<T,U>>& arr) {
        ostringstream oss;
        oss << "[";
        for (size_t i = 0; i < arr.size(); i++) {
            if (i) oss << ",";
            oss << "[" << arr[i].first << "," << arr[i].second << "]";
        }
        oss << "]";
        return oss.str();
    }

    template<typename T>
    static vector<T> to_vector(stack<T> S){
        vector<T> arr;
        while(S.size()){
            arr.push_back(S.top());
            S.pop();
        }
        return arr;
    }

    template<typename T>
    static vector<T> to_vector(queue<T> S){
        vector<T> arr;
        while(S.size()){
            arr.push_back(S.front());
            S.pop();
        }
        return arr;
    }

    template<typename T>
    static vector<T> to_vector(set<T> S){
        vector<T> arr;
        for(auto&v:S)arr.push_back(v);
        return arr;
    }

    void stop(){
        _stopFrames.push_back(_frameCount);
    }

    void fast(){
        if (_frameCount > 0) {
            _fastFrames.push_back(_frameCount - 1);
        }
    }

    void faston(){
        if (_frameCount > 0) {
            _fastonFrames.push_back(_frameCount - 1);
        }
    }

    void skip(){
        _skipFrames.push_back(_frameCount);
    }

    void addEditorHighlight(int code_line) {
        // 因不涉及特定 track，這裡我們直接針對所有的 track 或是當下輸出的 track
        // 為了避免影響排版，假設統一也是放在 track === 0 或是無條件
        // 但由於通常 key_frame / frame 是分開的，我們直接兩邊都加上或統一輸出
        _content += "                if (track === 0 || track === 1) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ", true);\n";
        _content += "                }\n";
    }

    void start_draw() {
        _content += "(function() {\n";
        _content += "    let track = 0;\n";
        _content += "    function renderFrame(f) {\n";
        _content += "        if (window.setFrameSleep) window.setFrameSleep(0);\n";
        _content += "        clearAllEditorHighlights();\n";
        _content += "        if (window.resetMessageCounter) window.resetMessageCounter();\n";
        _content += "        if (window.resetWordCounter) window.resetWordCounter();\n";
        _content += "        clearCanvas();\n";
        _content += "        switch(f) {\n";
    }
    
    void start_frame_draw(){
        // TLE 第一層：腳本大小限制
        if (_content.size() > 40 * 1024 * 1024) {
            double sizeMB = _content.size() / (1024.0 * 1024.0);
            cerr << "Script Size Exceeded: 腳本大小 " << fixed << setprecision(2) << sizeMB
                 << " MB，超出上限 40 MB (在第 " << _frameCount << " 幀觸發)" << endl;
            exit(1);
        }
        _content += "            case " + to_string(_frameCount) + ":\n";
    }

    void text_impl(
        const int code_line,
        const string text,
        const Pos pos
    ) {
        _content += "                if (track === 0) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    drawText(\"" + escapeJS(text) + "\", " + pos.toJson() + ", " + to_string(code_line) + ");\n";
        _content += "                }\n";
    }

    void key_text_impl(
        const int code_line,
        const string text,
        const Pos pos
    ) {
        _content += "                if (track === 1) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    drawText(\"" + escapeJS(text) + "\", " + pos.toJson() + ", " + to_string(code_line) + ");\n";
        _content += "                }\n";
    }

    void colored_text_impl(
        const int code_line,
        const vector<vector<string>> text,
        const Pos pos
    ) {
        _content += "                if (track === 0) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    " + _gen_colored_text(text, pos, code_line) + "\n";
        _content += "                }\n";
    }

    void key_colored_text_impl(
        const int code_line,
        const vector<vector<string>> text,
        const Pos pos
    ) {
        _content += "                if (track === 1) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    " + _gen_colored_text(text, pos, code_line) + "\n";
        _content += "                }\n";
    }

    void arrow_impl(
        const int code_line,
        const Pos startSpecJS,
        const Pos endSpecJS,
        const vector<pair<string,string>>& style = {},
        const string manual_id = ""
    ) {
        _content += "                if (track === 0) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    " + _gen_arrow(startSpecJS, endSpecJS, style, manual_id, code_line) + "\n";
        _content += "                }\n";
    }
    
    void draw_word_impl(const int code_line, const string text, const Pos pos) {
        _content += "                if (track === 0) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    drawWord(\"" + escapeJS(text) + "\", " + pos.toJson() + ", " + to_string(code_line) + ");\n";
        _content += "                }\n";
    }

    void key_draw_word_impl(const int code_line, const string text, const Pos pos) {
        _content += "                if (track === 1) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    drawWord(\"" + escapeJS(text) + "\", " + pos.toJson() + ", " + to_string(code_line) + ");\n";
        _content += "                }\n";
    }

    void key_arrow_impl(
        const int code_line,
        const Pos startSpecJS,
        const Pos endSpecJS,
        const vector<pair<string,string>>& style = {},
        const string manual_id = ""
    ) {
        _content += "                if (track === 1) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    " + _gen_arrow(startSpecJS, endSpecJS, style, manual_id, code_line) + "\n";
        _content += "                }\n";
    }

    template<typename T>
    void frame_draw_impl(
        const int code_line,
        const vector<vector<T>>& matrix = {}
    ) {
        Pos pos=Pos(0,0);
        _content += "                if (track === 0) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    " + _gen_draw2DArray("array2D", pos, matrix, {}, {}, "normal", 0, code_line) + "\n";
        _content += "                }\n";
    }

    template<typename T>
    void frame_draw_impl(
        const int code_line,
        const string groupID,
        const Pos pos,
        const vector<vector<T>>& matrix = {},
        const vector<array2D_style>& style = {},
        const vector<vector<int>>& range = {},
        const string draw_type = "normal",
        const int index = 0
    ) {
        _content += "                if (track === 0) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    " + _gen_draw2DArray(groupID, pos, matrix, style, range, draw_type, index, code_line) + "\n";
        _content += "                }\n";
    }

    template<typename T, typename = typename enable_if<!is_vector<T>::value>::type>
    void frame_draw_impl(
        const int code_line,
        const vector<T>& num = {}
    ) {
        Pos pos=Pos(0,0);
        _content += "                if (track === 0) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    " + _gen_drawArray("array", pos, num, {}, {0}, "normal", 0, 1, 0, {}, {}, {}, {}, {}, code_line) + "\n";
        _content += "                }\n";
    }

    // --- Stack & Queue Helper wrappers for accu_store ---
    template<typename T>
    void accu_stack(const int code_line, const string groupID, const Pos pos, const std::stack<T>& s, const vector<array_style>& style = {}, const vector<int>& range = {0}, const int itemsPerRow = 0, const int index = 0, const vector<int>& sl = {}, const vector<int>& ss = {}, const vector<int>& si = {}, const vector<int>& sf = {}, const vector<int>& srg = {}) {
        accu_store_impl(code_line, groupID, pos, AV::stack_to_vector(s), style, range, "stack", itemsPerRow, index, sl, ss, si, sf, srg);
    }

    template<typename T>
    void accu_queue(const int code_line, const string groupID, const Pos pos, const std::queue<T>& q, const vector<array_style>& style = {}, const vector<int>& range = {0}, const int itemsPerRow = 0, const int index = 0, const vector<int>& sl = {}, const vector<int>& ss = {}, const vector<int>& si = {}, const vector<int>& sf = {}, const vector<int>& srg = {}) {
        accu_store_impl(code_line, groupID, pos, AV::queue_to_vector(q), style, range, "queue", itemsPerRow, index, sl, ss, si, sf, srg);
    }
    
#define accu_draw_stack(groupID, pos, s, ...) accu_stack(__LINE__, groupID, pos, s, __VA_ARGS__)
#define accu_draw_queue(groupID, pos, q, ...) accu_queue(__LINE__, groupID, pos, q, __VA_ARGS__)

    template<typename T, typename = typename enable_if<!is_vector<T>::value>::type>
    void frame_draw_impl(
        const int code_line,
        const string groupID,
        const Pos pos,
        const vector<T>& num = {},
        const vector<array_style>& style = {},
        const vector<int>& range = {0},
        const string draw_type = "normal",
        const int itemsPerRow = 0,
        const int index = 0,
        const int gap = 0,
        const vector<int>& segment_lazy = {},
        const vector<int>& segment_sets = {},
        const vector<int>& segment_index = {},
        const vector<int>& segment_left  = {},
        const vector<int>& segment_right = {}
    ) {
        _content += "                if (track === 0) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    " + _gen_drawArray(groupID, pos, num, style, range, draw_type, itemsPerRow, index, gap, segment_lazy, segment_sets, segment_index, segment_left, segment_right, code_line) + "\n";
        _content += "                }\n";
    }

    template<typename T>
    void key_frame_draw_impl(
        const int code_line,
        const vector<vector<T>>& matrix = {}
    ) {
        Pos pos=Pos(0,0);
        _content += "                if (track === 1) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    " + _gen_draw2DArray("array2D", pos, matrix, {}, {}, "normal", 0, code_line) + "\n";
        _content += "                }\n";
    }

    template<typename T>
    void key_frame_draw_impl(
        const int code_line,
        const string groupID,
        const Pos pos,
        const vector<vector<T>>& matrix = {},
        const vector<array2D_style>& style = {},
        const vector<vector<int>>& range = {},
        const string draw_type = "normal",
        const int index = 0
    ) {
        _content += "                if (track === 1) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    " + _gen_draw2DArray(groupID, pos, matrix, style, range, draw_type, index, code_line) + "\n";
        _content += "                }\n";
        _keyFrames.push_back(_frameCount);
    }

    template<typename T, typename = typename enable_if<!is_vector<T>::value>::type>
    void key_frame_draw_impl(
        const int code_line,
        const vector<T>& num = {}
    ) {
        Pos pos=Pos(0,0);
        _content += "                if (track === 1) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    " + _gen_drawArray("array", pos, num, {}, {0}, "normal", 0, 1, 0, {}, {}, {}, {}, {}, code_line) + "\n";
        _content += "                }\n";
        _keyFrames.push_back(_frameCount);
    }

    template<typename T, typename = typename enable_if<!is_vector<T>::value>::type>
    void key_frame_draw_impl(
        const int code_line,
        const string groupID,
        const Pos pos,
        const vector<T>& num = {},
        const vector<array_style>& style ={},
        const vector<int>& range = {0},
        const string draw_type = "normal",
        const int itemsPerRow = 0,
        const int index = 0,
        const int gap = 0,
        const vector<int>& segment_lazy = {},
        const vector<int>& segment_sets = {},
        const vector<int>& segment_index = {},
        const vector<int>& segment_left  = {},
        const vector<int>& segment_right = {}
    ) {
        _content += "                if (track === 1) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    " + _gen_drawArray(groupID, pos, num, style, range, draw_type, itemsPerRow, index, gap, segment_lazy, segment_sets, segment_index, segment_left, segment_right, code_line) + "\n";
        _content += "                }\n";
        _keyFrames.push_back(_frameCount);
    }

    void end_frame_draw(){
        _content += "                break;\n";
        _frameCount++;
    }

    template<typename T>
    void draw_impl(
        const int code_line,
        const vector<vector<T>>& matrix = {}
    ) {
        Pos pos=Pos(0,0);
        _content += "            case " + to_string(_frameCount++) + ":\n";
        _content += "                if (track === 0) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    " + _gen_draw2DArray("array2D", pos, matrix, {}, {}, "normal", 0, code_line) + "\n";
        _content += "                }\n";
        _content += "                break;\n";
    }

    template<typename T>
    void draw_impl(
        const int code_line,
        const string groupID,
        const Pos pos,
        const vector<vector<T>>& matrix = {},
        const vector<array2D_style>& style ={},
        const vector<vector<int>>& range = {},
        const string draw_type = "normal",
        const int index = 0
    ) {
        _content += "            case " + to_string(_frameCount++) + ":\n";
        _content += "                if (track === 0) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    " + _gen_draw2DArray(groupID, pos, matrix, style, range, draw_type, index, code_line) + "\n";
        _content += "                }\n";
        _content += "                break;\n";
    }

    template<typename T, typename = typename enable_if<!is_vector<T>::value>::type>
    void draw_impl(
        const int code_line,
        const vector<T>& num = {}
    ) {
        Pos pos=Pos(0,0);
        _content += "            case " + to_string(_frameCount++) + ":\n";
        _content += "                if (track === 0) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    " + _gen_drawArray("array", pos, num, {}, {0}, "normal", 0, 1, 0, {}, {}, {}, {}, {}, code_line) + "\n";
        _content += "                }\n";
        _content += "                break;\n";
    }

    // --- 自動判別 Stack ---
    template<typename T>
    void draw_impl(const int code_line, const stack<T>& s) {
        draw_impl(code_line, "stack", Pos(0,0), to_vector(s), {}, {0}, "stack");
    }

    // --- 自動判別 Queue ---
    template<typename T>
    void draw_impl(const int code_line, const queue<T>& q) {
        draw_impl(code_line, "queue", Pos(0,0), to_vector(q), {}, {0}, "queue");
    }

    template<typename T, typename = typename enable_if<!is_vector<T>::value>::type>
    void draw_impl(
        const int code_line,
        const string groupID,
        const Pos pos,
        const vector<T>& num = {},
        const vector<array_style>& style ={},
        const vector<int>& range = {0},
        const string draw_type = "normal",
        const int itemsPerRow = 0,
        const int index = 0,
        const vector<int>& segment_lazy = {},
        const vector<int>& segment_sets = {},
        const vector<int>& segment_index = {},
        const vector<int>& segment_left  = {},
        const vector<int>& segment_right = {}
    ) {
        _content += "            case " + to_string(_frameCount++) + ":\n";
        _content += "                if (track === 0) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    " + _gen_drawArray(groupID, pos, num, style, range, draw_type, itemsPerRow, index, 0, segment_lazy, segment_sets, segment_index, segment_left, segment_right, code_line) + "\n";
        _content += "                }\n";
        _content += "                break;\n";
    }

    void camera_impl(const Pos pos, double zoom = 1.0) {
        _content += "                window.setCameraByPos(" + pos.toJson() + ", " + to_string(zoom) + ");\n";
    }

    void auto_camera_impl(double zoom = 0.9, double offsetX = 30.0, double offsetY = 0.0) {
        _content += "                window.setAutoCamera(" + to_string(zoom) + ", true, " + to_string(offsetX) + ", " + to_string(offsetY) + ");\n";
    }

    void sleep_impl(int ms = 1200) {
        _content += "                if (track === 0) { if(window.setFrameSleep) window.setFrameSleep(" + to_string(ms) + "); }\n";
    }

    void end_draw() {
        _content += "        }\n";
        _content += "    }\n";
        _content += "    let currentFrame = 0;\n";
        _content += "    const totalFrames = " + to_string(_frameCount) + ";\n";
        _content += "    const keyFrames = " + array_to_string(_keyFrames) + ";\n";
        _content += "    const stopFrames = [" + integers_to_string(_stopFrames) + (_stopFrames.empty()?"":",") + to_string(_frameCount-1) + "];\n";
        _content += "    const fastFrames = " + array_to_string(_fastFrames) + ";\n";
        _content += "    const fastonFrames = " + array_to_string(_fastonFrames) + ";\n";
        _content += "    const skipFrames = " + array_to_string(_skipFrames) + ";\n";
        _content += "\n";
        _content += "    function findNextKey(frame) {\n";
        _content += "        let L = 0, R = keyFrames.length - 1;\n";
        _content += "        let ans = -1;\n";
        _content += "        while (L <= R) {\n";
        _content += "            const M = Math.floor((L + R) / 2);\n";
        _content += "            if (keyFrames[M] > frame) {\n";
        _content += "                ans = keyFrames[M];\n";
        _content += "                R = M - 1;\n";
        _content += "            } else {\n";
        _content += "                L = M + 1;\n";
        _content += "            }\n";
        _content += "        }\n";
        _content += "        return ans;\n";
        _content += "    }\n";
        _content += "\n";
        _content += "    function findPrevKey(frame) {\n";
        _content += "        let L = 0, R = keyFrames.length - 1;\n";
        _content += "        let ans = -1;\n";
        _content += "        while (L <= R) {\n";
        _content += "        const M = Math.floor((L + R) / 2);\n";
        _content += "            if (keyFrames[M] < frame) {\n";
        _content += "                ans = keyFrames[M];\n";
        _content += "                L = M + 1;\n";
        _content += "            } else {\n";
        _content += "                R = M - 1;\n";
        _content += "            }\n";
        _content += "        }\n";
        _content += "        return ans;\n";
        _content += "    }\n";
        _content += "\n";
        _content += "    window.CodeScript = {\n";
        _content += "        next() {\n";
        _content += "            track = 0;\n";
        _content += "            if (currentFrame < totalFrames - 1) {\n";
        _content += "                currentFrame++;\n";
        _content += "                renderFrame(currentFrame);\n";
        _content += "            }\n";
        _content += "        },\n";
        _content += "        prev() {\n";
        _content += "            track = 0;\n";        
        _content += "            if (currentFrame > 0) {\n";
        _content += "                currentFrame--;\n";
        _content += "                renderFrame(currentFrame);\n";
        _content += "            }\n";
        _content += "        },\n";
        _content += "        next_key_frame() {\n";
        _content += "            if (keyFrames.length > 0){\n";
        _content += "                let nk = findNextKey(currentFrame);\n";
        _content += "                if (nk === -1) return;\n";
        _content += "                let ns = totalFrames - 1;\n";
        _content += "                for (let s of stopFrames) { if (s > currentFrame) { ns = s; break; } }\n";
        _content += "                let nsk = totalFrames - 1;\n";
        _content += "                for (let s of skipFrames) { if (s > currentFrame) { nsk = s; break; } }\n";
        _content += "                \n";
        _content += "                let target = Math.min(nk, ns, nsk);\n";
        _content += "                track = 1; // 既然是快進模式跳轉，統一使用 track 1 (關鍵影格軌道)\n";
        _content += "\n";
        _content += "                currentFrame = target;\n";
        _content += "                renderFrame(currentFrame);\n";
        _content += "            }\n";
        _content += "        },\n";
        _content += "        prev_key_frame() {\n";
        _content += "            if (keyFrames.length > 0){\n";        
        _content += "                track = 1;\n";
        _content += "                currentFrame = findPrevKey(currentFrame);\n";
        _content += "                renderFrame(currentFrame);\n";
        _content += "            }\n";        
        _content += "        },\n";
        _content += "        reset() {\n";
        _content += "            track = 0;\n";
        _content += "            currentFrame = 0;\n";
        _content += "            renderFrame(0);\n";
        _content += "        },\n";
        _content += "        goto(n) {\n";
        _content += "            if (n >= 0 && n < totalFrames) {\n";
        _content += "                track = 0;\n";
        _content += "                currentFrame = n;\n";
        _content += "                renderFrame(n);\n";
        _content += "            } else if (n == -1) {\n";
        _content += "                track = 0;\n";
        _content += "                currentFrame = totalFrames - 1;\n";
        _content += "                renderFrame(totalFrames - 1);\n";
        _content += "            }\n";
        _content += "        },\n";
        _content += "        get_frame_count() {\n";
        _content += "            return totalFrames;\n";
        _content += "        },\n";
        _content += "        get_current_frame_index() {\n";
        _content += "            return currentFrame;\n";
        _content += "        },\n";
        _content += "        get_key_frames() {\n";
        _content += "            return keyFrames;\n";
        _content += "        },\n";
        _content += "        get_stop_frames() {\n";
        _content += "            return stopFrames;\n";
        _content += "        },\n";
        _content += "        is_stop_frame() {\n";
        _content += "            return stopFrames.includes(currentFrame);\n";
        _content += "        },\n";
        _content += "        is_fast_frame() {\n";
        _content += "            return fastFrames.includes(currentFrame);\n";
        _content += "        },\n";
        _content += "        is_faston_frame() {\n";
        _content += "            return fastonFrames.includes(currentFrame);\n";
        _content += "        },\n";
        _content += "        is_skip_frame() {\n";
        _content += "            return skipFrames.includes(currentFrame);\n";
        _content += "        },\n";
        _content += "        has_next_key() {\n";
        _content += "            return findNextKey(currentFrame) !== -1;\n";
        _content += "        },\n";
        _content += "        has_prev_key() {\n";
        _content += "            return findPrevKey(currentFrame) !== -1;\n";
        _content += "        }\n";
        _content += "    };\n";
        _content += "    document.addEventListener('DOMContentLoaded', () => {\n";
        _content += "        CodeScript.reset();\n";
        _content += "    });\n";
        _content += "})();\n\n";
        
        // 最終腳本大小檢查
        const size_t MAX_SCRIPT_SIZE = 40 * 1024 * 1024;
        if (_content.size() > MAX_SCRIPT_SIZE) {
            double sizeMB = _content.size() / (1024.0 * 1024.0);
            cerr << "Script Size Exceeded: 腳本大小 " << fixed << setprecision(2) << sizeMB
                 << " MB，超出上限 " << (MAX_SCRIPT_SIZE / 1024 / 1024) << " MB" << endl;
            exit(1);
        }
        cerr << "[debug] 腳本大小: " << (_content.size() / 1024) << " KB (" 
             << fixed << setprecision(2) << (_content.size() / (1024.0 * 1024.0)) << " MB)" << endl;

        // 寫檔
        ofstream ofs(_outPath, ios::out | ios::trunc);
        if (!ofs) {
            cerr << "無法開啟 " << _outPath << " 進行寫入！\n";
            return;
        }
        ofs << _content;
        ofs.close();
        cout << "已成功畫圖\n";
    }

    // --- Type-safe Draw Overloads for stack & queue ---
    template<typename T>
    void draw_impl(const int code_line, const string groupID, const Pos pos, const std::stack<T>& s, const vector<array_style>& style = {}, const vector<int>& range = {0}, const int index = 0) {
        _content += "            case " + to_string(_frameCount++) + ":\n";
        _content += "                if (track === 0) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    ";
        _content += "drawArray(\'" + groupID + "\', " + pos.toJson() + ", " + array_to_string(AV::stack_to_vector(s)) + ", " + arraystyle_to_object(style) + ", " + array_to_string(range) + ", \"stack\", 0, " + to_string(index) + ");\n";
        _content += "                }\n";
        _content += "                break;\n";
    }
    template<typename T>
    void draw_impl(const int code_line, const string groupID, const Pos pos, const std::queue<T>& q, const vector<array_style>& style = {}, const vector<int>& range = {0}, const int index = 0) {
        _content += "            case " + to_string(_frameCount++) + ":\n";
        _content += "                if (track === 0) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    ";
        _content += "drawArray(\'" + groupID + "\', " + pos.toJson() + ", " + array_to_string(AV::queue_to_vector(q)) + ", " + arraystyle_to_object(style) + ", " + array_to_string(range) + ", \"queue\", 0, " + to_string(index) + ");\n";
        _content += "                }\n";
        _content += "                break;\n";
    }
    template<typename T>
    void frame_draw_impl(const int code_line, const string groupID, const Pos pos, const std::stack<T>& s, const vector<array_style>& style = {}, const vector<int>& range = {0}, const int index = 0) {
        _content += "                if (track === 0) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    ";
        _content += "drawArray(\'" + groupID + "\', " + pos.toJson() + ", " + array_to_string(AV::stack_to_vector(s)) + ", " + arraystyle_to_object(style) + ", " + array_to_string(range) + ", \"stack\", 0, " + to_string(index) + ");\n";
        _content += "                }\n";
    }
    template<typename T>
    void frame_draw_impl(const int code_line, const string groupID, const Pos pos, const std::queue<T>& q, const vector<array_style>& style = {}, const vector<int>& range = {0}, const int index = 0) {
        _content += "                if (track === 0) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    ";
        _content += "drawArray(\'" + groupID + "\', " + pos.toJson() + ", " + array_to_string(AV::queue_to_vector(q)) + ", " + arraystyle_to_object(style) + ", " + array_to_string(range) + ", \"queue\", 0, " + to_string(index) + ");\n";
        _content += "                }\n";
    }
    template<typename T>
    void key_frame_draw_impl(const int code_line, const string groupID, const Pos pos, const std::stack<T>& s, const vector<array_style>& style = {}, const vector<int>& range = {0}, const int index = 0) {
        _content += "                if (track === 1) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    ";
        _content += "drawArray(\'" + groupID + "\', " + pos.toJson() + ", " + array_to_string(AV::stack_to_vector(s)) + ", " + arraystyle_to_object(style) + ", " + array_to_string(range) + ", \"stack\", 0, " + to_string(index) + ");\n";
        _content += "                }\n";
        _keyFrames.push_back(_frameCount);
    }
    template<typename T>
    void key_frame_draw_impl(const int code_line, const string groupID, const Pos pos, const std::queue<T>& q, const vector<array_style>& style = {}, const vector<int>& range = {0}, const int index = 0) {
        _content += "                if (track === 1) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    ";
        _content += "drawArray(\'" + groupID + "\', " + pos.toJson() + ", " + array_to_string(AV::queue_to_vector(q)) + ", " + arraystyle_to_object(style) + ", " + array_to_string(range) + ", \"queue\", 0, " + to_string(index) + ");\n";
        _content += "                }\n";
        _keyFrames.push_back(_frameCount);
    }

    template<typename T>
    static vector<T> stack_to_vector(std::stack<T> s) {
        vector<T> v;
        while (!s.empty()) {
            v.insert(v.begin(), s.top()); // 底層在 index 0
            s.pop();
        }
        return v;
    }

    template<typename T>
    static vector<T> queue_to_vector(std::queue<T> q) {
        vector<T> v;
        while (!q.empty()) {
            v.push_back(q.front());
            q.pop();
        }
        return v;
    }

private:
    string _outPath;
    string _content;
    int _frameCount;
    vector<int> _keyFrames;
    vector<int> _stopFrames;
    vector<int> _fastFrames;
    vector<int> _fastonFrames;
    vector<int> _skipFrames;
    vector<string> type = {"type","color"};
    // 每條記錄為 (code_line, JS指令)，對齊 frame_draw 的行號追蹤方式
    // code_line = -1 代表不高亮任何行（例如笔辟 / 筮頭 / 不需要高亮的元素）
    vector<pair<int,string>> _accu_history;

    string _gen_text(const string& t, const Pos& p, int code_line = -1) {
        return "drawText(\"" + escapeJS(t) + "\", " + p.toJson() + ", " + to_string(code_line) + ");";
    }
    string _gen_word(const string& t, const Pos& p, int code_line = -1) {
        return "drawWord(\"" + escapeJS(t) + "\", " + p.toJson() + ", " + to_string(code_line) + ");";
    }
    string _gen_colored_text(const vector<vector<string>>& v, const Pos& p, int code_line = -1) {
        return "drawColoredText(" + VVS_to_string(v) + ", " + p.toJson() + ", " + to_string(code_line) + ");";
    }
    string _gen_arrow(const Pos& s, const Pos& e, const vector<pair<string,string>>& st, const string& manual_id = "", int code_line = -1) {
        string opt = pair_string_to_object(st);
        if (!manual_id.empty()) {
            if (!opt.empty()) opt += " ,";
            opt += "key: \"" + escapeJS(manual_id) + "\"";
        }
        return "drawArrow(" + s.toJson() + ", " + e.toJson() + ", { " + opt + " }, " + to_string(code_line) + ");";
    }
    template<typename T>
    string _gen_draw2DArray(const string& g, const Pos& p, const vector<vector<T>>& m, const vector<array2D_style>& s, const vector<vector<int>>& r, const string& t, int i, int code_line = -1) {
        return "draw2DArray(\'" + g + "\', " + p.toJson() + ", " + array2D_to_string(m) + ", " + array2Dstyle_to_object(s) + ", " + array2D_to_string(r) + ", \"" + t + "\", " + to_string(i) + ", " + to_string(code_line) + ");";
    }
    string _gen_drawCircle(const string& id, const Pos& p, const string& v, const vector<pair<string,string>>& s, int code_line = -1) {
        return "drawCircle(\'" + id + "\', " + p.toJson() + ", \"" + escapeJS(v) + "\", " + styles_to_json_array(s) + ", " + to_string(code_line) + ");";
    }
    string _gen_drawTriangle(const string& id, const Pos& pos, double h, double w, const vector<pair<string,string>>& style = {}, int code_line = -1) {
        return "drawTriangle(\'" + id + "\', " + pos.toJson() + ", " + to_string(h) + ", " + to_string(w) + ", " + styles_to_json_array(style) + ", " + to_string(code_line) + ");";
    }
    template<typename T>
    string _gen_drawArray(const string& g, const Pos& p, const vector<T>& n, const vector<array_style>& s, const vector<int>& r, const string& t, int pr, int i, int gap, const vector<int>& sl, const vector<int>& ss, const vector<int>& si, const vector<int>& sf, const vector<int>& srg, int code_line = -1) {
        return "drawArray(\'" + g + "\', " + p.toJson() + ", " + array_to_string(n) + ", " + arraystyle_to_object(s) + ", " + array_to_string(r) + ", \"" + t + "\", " + to_string(pr) + ", " + to_string(i) + ", " + to_string(gap) + ", " + array_to_string(sl) + ", " + array_to_string(ss) + ", " + array_to_string(si) + ", " + array_to_string(sf) + ", " + array_to_string(srg) + ", " + to_string(code_line) + ");";
    }

public:
    // --- Manual Accumulation System ---
    void accu_draw() {
        _content += "                if (track === 0) {\n";
        for (const auto& entry : _accu_history) {
            _content += "                    " + entry.second + "\n";
        }
        _content += "                }\n";
    }
    void key_accu_draw() {
        _content += "                if (track === 1) {\n";
        for (const auto& entry : _accu_history) {
            _content += "                    " + entry.second + "\n";
        }
        _content += "                }\n";
    }
    void accu_clear() { _accu_history.clear(); }

    // ─── accu_store_impl 族：实際儲入用（透過巨集帶入 __LINE__） ───
    void accu_store_impl(const int code_line, const string t, const Pos p) {
        _accu_history.push_back({code_line, _gen_text(t, p, code_line)});
    }
    void accu_store_word_impl(const int code_line, const string t, const Pos p) {
        _accu_history.push_back({code_line, _gen_word(t, p, code_line)});
    }
    void accu_store_colored_impl(const int code_line, const vector<vector<string>> v, const Pos p) {
        _accu_history.push_back({code_line, _gen_colored_text(v, p, code_line)});
    }
    void accu_store_arrow_impl(const int code_line, const Pos s, const Pos e, const vector<pair<string,string>>& st = {}, const string& manual_id = "") {
        _accu_history.push_back({code_line, _gen_arrow(s, e, st, manual_id, code_line)});
    }

    template<typename T>
    void accu_store_impl(const int code_line, const string groupID, const Pos pos, const vector<T>& num = {}, const vector<array_style>& style = {}, const vector<int>& range = {0}, const string draw_type = "normal", const int itemsPerRow = 0, const int index = 0, const int gap = 0, const vector<int>& sl = {}, const vector<int>& ss = {}, const vector<int>& si = {}, const vector<int>& sf = {}, const vector<int>& srg = {}) {
        _accu_history.push_back({code_line, _gen_drawArray(groupID, pos, num, style, range, draw_type, itemsPerRow, index, gap, sl, ss, si, sf, srg, code_line)});
    }

    template<typename T>
    void accu_store_2D_impl(const int code_line, const string groupID, const Pos pos, const vector<vector<T>>& matrix = {}, const vector<array2D_style>& style = {}, const vector<vector<int>>& range = {}, const string draw_type = "normal", const int index = 0) {
        _accu_history.push_back({code_line, _gen_draw2DArray(groupID, pos, matrix, style, range, draw_type, index, code_line)});
    }

    template<typename T>
    void accu_store_circle_impl(const int code_line, const string id, const Pos pos, const T value, const vector<pair<string,string>>& style = {}) {
        ostringstream oss; oss << value;
        _accu_history.push_back({code_line, _gen_drawCircle(id, pos, oss.str(), style, code_line)});
    }

    // ─── draw_circle 族 ───
    template<typename T>
    void draw_circle_impl(const int code_line, const string id, const Pos pos, const T value, const vector<pair<string,string>>& style = {}) {
        _content += "                if (track === 0) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        ostringstream oss; oss << value;
        _content += "                    " + _gen_drawCircle(id, pos, oss.str(), style, code_line) + "\n";
        _content += "                }\n";
    }
    template<typename T>
    void key_draw_circle_impl(const int code_line, const string id, const Pos pos, const T value, const vector<pair<string,string>>& style = {}) {
        _content += "                if (track === 1) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        ostringstream oss; oss << value;
        _content += "                    " + _gen_drawCircle(id, pos, oss.str(), style, code_line) + "\n";
        _content += "                }\n";
    }

    // ─── draw_triangle 族 ───
    void draw_triangle_impl(const int code_line, const string& id, const Pos& pos, double h, double w, const vector<pair<string,string>>& style = {}) {
        string tid = id.empty() ? ("triangle_" + to_string(code_line)) : id;
        _content += "                if (track === 0) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    " + _gen_drawTriangle(tid, pos, h, w, style, code_line) + "\n";
        _content += "                }\n";
    }
    void key_draw_triangle_impl(const int code_line, const string& id, const Pos& pos, double h, double w, const vector<pair<string,string>>& style = {}) {
        string tid = id.empty() ? ("triangle_" + to_string(code_line)) : id;
        _content += "                if (track === 1) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    " + _gen_drawTriangle(tid, pos, h, w, style, code_line) + "\n";
        _content += "                }\n";
    }

    void accu_store_triangle_impl(const int code_line, const string& id, const Pos& pos, double h, double w, const vector<pair<string,string>>& style = {}) {
        string tid = id.empty() ? ("triangle_accu_" + to_string(code_line) + "_" + to_string(_accu_history.size())) : id;
        _accu_history.push_back({code_line, _gen_drawTriangle(tid, pos, h, w, style, code_line)});
    }

    static string resolve_av_color(const string& color) {
        static const std::map<string, string> colors = {
            {"AV_green",      "rgba(165, 214, 167, 0.6)"},
            {"AV_blue",       "rgba(144, 202, 249, 0.6)"},
            {"AV_red",        "rgba(239, 154, 154, 0.6)"},
            {"AV_yellow",     "rgba(252, 255, 64, 0.46)"},
            {"AV_orange",     "orange"},
            {"AV_node_green", "#e8f5e9"},
            {"AV_node_red",   "#ef9a9a"},
            {"AV_grey",       "#cccccc"},
            {"AV_node_grey",  "#cccccc"},
            {"AV_black",      "black"},
            {"AV_white",      "white"}
        };
        auto it = colors.find(color);
        return (it != colors.end()) ? it->second : color;
    }

    string integers_to_string(const vector<int>& num){
        string tmp = "";
        for(int i=0;i<num.size();i++){
            tmp += to_string(num[i]) + ",";
        }
        return tmp;
    }

    string pair_string_to_object(const vector<pair<string,string>>& stylelist){
        string tmp = "";
        for(int i=0;i<stylelist.size();i++){
            if(i)tmp += " ,";
            string val = stylelist[i].second;
            if (stylelist[i].first == "color" || stylelist[i].first == "background" || stylelist[i].first == "bg_color" || stylelist[i].first == "font_color") {
                val = resolve_av_color(val);
            }
            tmp += stylelist[i].first + ": \"" + escapeJS(val) + "\"";
        }
        return tmp;
    }

    string styles_to_json_array(const vector<pair<string,string>>& stylelist){
        string tmp = "[";
        for(int i=0;i<stylelist.size();i++){
            if(i)tmp += ",";
            string val = resolve_av_color(stylelist[i].second);
            tmp += "{\"type\": \"" + stylelist[i].first + "\", \"color\": \"" + escapeJS(val) + "\"}";
        }
        return tmp + "]";
    }

    string arraystyle_to_object(const vector<array_style>& stylelist){
        string tmp = "[";
        for(int i=0;i<stylelist.size();i++){
            if(i)tmp += ",";
            tmp += arrayobject_to_string(stylelist[i].first,stylelist[i].second);
        }
        return tmp += "]";
    }

    string array2Dstyle_to_object(const vector<array2D_style>& stylelist){
        string tmp = "[";
        for(int i=0;i<stylelist.size();i++){
            if(i)tmp += ",";
            tmp += array2Dobject_to_string(stylelist[i].first,stylelist[i].second);
        }
        return tmp += "]";
    }
    
    string arrayobject_to_string(const vector<string>& style,const vector<int>& num){
        string tmp = "{";
        vector<string> type = {"type","color"};
        for(int i=0;i<style.size();i++){
            string val = resolve_av_color(style[i]);
            tmp += " " + type[i] + ": \"" + escapeJS(val) + "\",";
        }
        tmp += " elements: " + array_to_string(num);
        return tmp + "}";
    }

    string array2Dobject_to_string(const vector<string>& style,const vector<pair<int,int>>& num){
        string tmp = "{";
        vector<string> type = {"type","color"};
        for(int i=0;i<style.size();i++){
            tmp += " " + type[i] + ": \"" + style[i]+ "\",";
        }
        tmp += " elements: " + array2D_to_string(num);
        return tmp + "}";
    }

    string VPPIIS_to_string(const vector<pair<pair<int,int>,string>>& v) {
        string tmp = "[";
        for (size_t i = 0; i < v.size(); ++i) {
            if (i) tmp += ",";
            tmp += "[[" + to_string(v[i].first.first) + "," + to_string(v[i].first.second) + "],";
            tmp += "\"" + v[i].second + "\"]";
        }
        tmp += "]";
        return tmp;
    }

    static string escapeJS(const string& s) {
        string out;
        for (char c : s) {
            switch (c) {
                case '\\': out += "\\\\"; break; // 反斜線 → \\ 
                case '"':  out += "\\\""; break; // 雙引號 → \"
                case '\n': out += "\\n"; break;  // 換行 → \n
                case '\r': break;                // 忽略 \r
                case '\t': out += "\\t"; break;  // tab → \t
                default:   out += c; break;
            }
        }
        return out;
    }

    static string VVS_to_string(const vector<vector<string>>& v){
        string tmp = "[";
        vector<string> board={"text","bg_color","font_color","font_size"};
        for (size_t i = 0; i < v.size(); ++i){
            if (i) tmp += ",";
            tmp += "{" + board[0] + ": \"" + escapeJS(v[i][0]) + "\"";
            for (size_t j = 1; j < v[i].size(); ++j){
                string val = v[i][j];
                // 索引 1 (bg) 和 2 (font) 需要解析顏色
                if (j == 1 || j == 2) val = resolve_av_color(val);
                tmp += ", " + board[j] + ": \"" + escapeJS(val) + "\"";
            }
            tmp += "}";
        }
        tmp += "]";
        return tmp;
    }

    // --- End of AV class members (previously moved overloads to public) ---

};

struct TreeLayout {
    int degree;      // 樹的分支度 (例如 2 代表二元樹)
    Pos root_pos;    // 根節點的基準位置
    double dx;       // 底層相鄰節點之間的最小水平間距
    double dy;       // 每層之間的垂直間距
    std::set<pair<int,int>> nodes; // 記錄目前已經加入的所有節點
    std::map<pair<int,int>, double> custom_x; // 儲存計算好的各種節點 x 座標
    string prefix;   // 物件 ID 前綴
    double min_x, max_x, min_y, max_y; // 樹的外框邊界
    
    // --- 渲染器模式所需資料 ---
    std::map<pair<int,int>, string> vals; // 改用 string，支援 "5" 或 "3+2"
    std::map<pair<int,int>, int> results; // 節點計算完的結果
    std::map<pair<int,int>, string> edge_colors; // 紀錄從該節點指向父節點的線條顏色
    std::map<pair<int,int>, string> node_colors; // 紀錄個別節點的背景顏色 (例如 "red", "green")
    typedef std::function<void(string id, Pos p, int d, int o, bool is_focus)> Renderer;
    Renderer renderer = nullptr;
    bool _is_key_drawing = false; // key_redraw 時設為 true，renderer 可讀取此旗標 

    // 遞迴路徑追蹤系統
    int curr_d = 0;      // 當前深度
    int curr_o = 0;      // 當前順序
    vector<pair<int, int>> path_stack; // 備份堆疊
    bool show_edges = true; // 控制是否畫預設連線
    bool horizontal = false; // 新增：是否橫向排列
    
    enum LayoutMode { 
        COMPACT = 0,     // 自動收縮 (Bottom-up)
        LEVELORDER = 1, // 層序等距：x = order * dx
        BINARY = 2,      // 完美回推：每一層格點固定由深度決定
        INORDER = 3,     // 中序等距：x 由中序走訪順序決定
        PREORDER = 4,    // 前序等距：父節點在左
        POSTORDER = 5    // 後序等距：父節點在右
    } mode = COMPACT;

    TreeLayout(string _prefix, int _degree = 2, Pos _root_pos = Pos(500,100), double _dx = 60.0, double _dy = 120.0)
        : prefix(_prefix), degree(_degree), root_pos(_root_pos), dx(_dx), dy(_dy), horizontal(false),
          min_x(0), max_x(0), min_y(0), max_y(0) {
        }

    // 向下追蹤子分支
    void push(int branch) {
        path_stack.push_back({curr_d, curr_o});
        curr_o = curr_o * degree + branch;
        curr_d++;
    }

    // 回到父節點
    void pop() {
        if (!path_stack.empty()) {
            curr_d = path_stack.back().first;
            curr_o = path_stack.back().second;
            path_stack.pop_back();
        }
    }

    // 重繪整棵樹
    void redraw(AV& av) {
        if (!renderer) return; 
        
        std::set<pair<int,int>> active_path;
        active_path.insert({curr_d, curr_o});
        for(auto p : path_stack) active_path.insert(p);

        // 輸出整棵樹的 Meta 資訊，供 Pos(prefix) 定位使用
        string meta_style = "{ \"layout\": \"tree\", \"minX\": " + to_string(root_pos.x + min_x - dx/2) + 
                            ", \"maxX\": " + to_string(root_pos.x + max_x + dx/2) + 
                            ", \"minY\": " + to_string(root_pos.y + min_y) + 
                            ", \"maxY\": " + to_string(root_pos.y + max_y + 40) + " }";
        av._content += "                if (track === 0) { setLayoutMeta(\"" + prefix + "\", " + meta_style + "); }\n";

        // 使用 DFS 順序走訪 nodes，這能確保箭頭輸出的順序與 DFS 一致
        // 同時我們為 arrow 加入 key，確保動畫過渡時能準確配對
        std::function<void(int, int)> dfs = [&](int d, int o) {
            if (nodes.find({d, o}) == nodes.end()) return;

            string id = get_id(d, o);
            Pos p = get_pos(d, o);
            bool is_focus = (d == curr_d && o == curr_o);
            
            renderer(id, p, d, o, is_focus);
            
            if (show_edges && d > 0) {
                string pid = get_id(d - 1, o / degree);
                string color = "black";
                if (edge_colors.count({d, o})) {
                    color = edge_colors[{d, o}];
                } else if (active_path.count({d, o}) && active_path.count({d-1, o/degree})) {
                    color = "orange";
                }

                // 透過 key 屬性讓前端 drawArrow 能夠根據唯一的 ID 做 tween 動畫
                vector<pair<string, string>> style = {{"color", color}, {"width", "2"}};
                string dir = (o % degree == 0) ? "L" : (o % degree == 1 ? "R" : to_string(o % degree));
                string arrow_id = prefix + "_d" + to_string(d - 1) + "-" + to_string(o / degree) + "_" + dir + "_d" + to_string(d) + "-" + to_string(o);

                if (horizontal) {
                    av.arrow(Pos(pid, "right"), Pos(id, "left"), style, arrow_id);
                } else {
                    av.arrow(Pos(pid, "bottom"), Pos(id, "top"), style, arrow_id);
                }
            }

            // 遞迴子節點
            for (int i = 0; i < degree; i++) {
                dfs(d + 1, o * degree + i);
            }
        };

        dfs(0, 0);
    }

    void key_redraw(AV& av) {
        if (!renderer) return;
        _is_key_drawing = true;

        std::set<pair<int,int>> active_path;
        active_path.insert({curr_d, curr_o});
        for(auto p : path_stack) active_path.insert(p);

        // 輸出整棵樹的 Meta 資訊 (track 1)
        string meta_style = "{ \"layout\": \"tree\", \"minX\": " + to_string(root_pos.x + min_x - dx/2) +
                            ", \"maxX\": " + to_string(root_pos.x + max_x + dx/2) +
                            ", \"minY\": " + to_string(root_pos.y + min_y) +
                            ", \"maxY\": " + to_string(root_pos.y + max_y + 40) + " }";
        av._content += "                if (track === 1) { setLayoutMeta(\"" + prefix + "\", " + meta_style + "); }\n";

        std::function<void(int, int)> dfs = [&](int d, int o) {
            if (nodes.find({d, o}) == nodes.end()) return;

            string id = get_id(d, o);
            Pos p = get_pos(d, o);
            bool is_focus = (d == curr_d && o == curr_o);

            renderer(id, p, d, o, is_focus); // _is_key_drawing 已為 true

            if (show_edges && d > 0) {
                string pid = get_id(d - 1, o / degree);
                string color = "black";
                if (edge_colors.count({d, o})) {
                    color = edge_colors[{d, o}];
                } else if (active_path.count({d, o}) && active_path.count({d-1, o/degree})) {
                    color = "orange";
                }
                vector<pair<string, string>> style = {{"color", color}, {"width", "2"}};
                string dir = (o % degree == 0) ? "L" : (o % degree == 1 ? "R" : to_string(o % degree));
                string arrow_id = prefix + "_d" + to_string(d - 1) + "-" + to_string(o / degree) + "_" + dir + "_d" + to_string(d) + "-" + to_string(o);
                if (horizontal) {
                    av.key_arrow(Pos(pid, "right"), Pos(id, "left"), style, arrow_id);
                } else {
                    av.key_arrow(Pos(pid, "bottom"), Pos(id, "top"), style, arrow_id);
                }
            }

            for (int i = 0; i < degree; i++) {
                dfs(d + 1, o * degree + i);
            }
        };
        dfs(0, 0);
        _is_key_drawing = false;
    }
    // after: 可選 callback，在 frame 關閉前執行 (用來插入 av.text 等)
    void paint(AV& av, string val = "", int res = -1, std::function<void()> after = nullptr) {
        int d = curr_d, o = curr_o;
        if (nodes.find({d, o}) == nodes.end() || !val.empty()) {
            while (d >= 0) { nodes.insert({d, o}); d--; o /= degree; }
            if (!val.empty()) vals[{curr_d, curr_o}] = val;
            update_layout();
        }
        if (res != -1) results[{curr_d, curr_o}] = res;

        av.start_frame_draw();
        redraw(av);    // 先畫節點，讓箭頭有錨點可以抓
        av.accu_draw(); // 再畫累積的箭頭與文字
        if (after) after();
        av.end_frame_draw();
    }

    // 統一畫圖接口 (Int 版)
    void paint(AV& av, int val, int res = -1, std::function<void()> after = nullptr) {
        if (val == -1) paint(av, string(""), res, after);
        else paint(av, to_string(val), res, after);
    }
    // 核心算法：給定當前的 nodes，由下而上(Bottom-up)重新計算所有節點的相對 x 座標
    void update_layout() {
        if (nodes.empty()) return;
        custom_x.clear();
        function<pair<double, double>(int, int, double&)> calc_width = [&](int d, int o, double& start_x) -> pair<double, double> {
            if (nodes.count({d, o}) == 0) return {start_x, start_x};
            bool has_child = false;
            for (int i = 0; i < degree; i++) if (nodes.count({d + 1, o * degree + i})) has_child = true;
            if (!has_child) {
                custom_x[{d, o}] = start_x;
                double ml = start_x, mr = start_x; start_x += dx; return {ml, mr};
            }
            double leftmost = 1e9, rightmost = -1e9;
            vector<double> centers;
            for (int i = 0; i < degree; i++) {
                if (nodes.count({d + 1, o * degree + i})) {
                    auto b = calc_width(d + 1, o * degree + i, start_x);
                    leftmost = min(leftmost, b.first); rightmost = max(rightmost, b.second);
                    centers.push_back(custom_x[{d + 1, o * degree + i}]);
                }
            }
            custom_x[{d, o}] = (centers.front() + centers.back()) / 2.0;
            return {leftmost, rightmost};
        };

        if (mode == COMPACT) {
            double cursor = 0.0;
            calc_width(0, 0, cursor);
            double root_offset = custom_x[{0,0}];
            for (auto& p : custom_x) p.second -= root_offset;
        } 
        else if (mode == LEVELORDER) {
            // 全域序列排列：下層的節點全部都在當前層的右邊
            double global_cursor = 0.0;
            std::map<int, std::vector<int>> levels;
            for (auto const& node : nodes) {
                levels[node.first].push_back(node.second);
            }
            
            // 按照深度排序處理
            std::vector<int> depths;
            for (auto const& kv : levels) depths.push_back(kv.first);
            std::sort(depths.begin(), depths.end());

            for (int d : depths) {
                std::vector<int>& os = levels[d];
                std::sort(os.begin(), os.end());
                for (int o : os) {
                    custom_x[{d, o}] = global_cursor;
                    global_cursor += dx; // 下一個節點必定在右邊
                }
            }
            // 統一對齊：讓 Root 在 0
            if (nodes.count({0,0})) {
                double root_offset = custom_x[{0,0}];
                for (auto& p : custom_x) p.second -= root_offset;
            }
        }
        else if (mode == INORDER) {
            double cursor = 0.0;
            std::function<void(int, int)> inorder = [&](int d, int o) {
                if (nodes.count({d, o}) == 0) return;
                // 分支度支援多子節點，這裡將其分為兩半來模擬中序
                int mid = degree / 2;
                // 左半部分
                for (int i = 0; i < mid; i++) inorder(d + 1, o * degree + i);
                // 自己
                custom_x[{d, o}] = cursor;
                cursor += dx;
                // 右半部分
                for (int i = mid; i < degree; i++) inorder(d + 1, o * degree + i);
            };
            inorder(0, 0);
            
            // 統一對齊：讓 Root 在 0
            if (nodes.count({0,0})) {
                double root_offset = custom_x[{0,0}];
                for (auto& p : custom_x) p.second -= root_offset;
            }
        }
        else if (mode == BINARY) {
            // 先找出最大深度
            int max_h = 0;
            for (auto const& node : nodes) max_h = max(max_h, node.first);
            
            for (auto const& node : nodes) {
                int d = node.first;
                int o = node.second;
                // 每個節點在底層佔據的寬度為 pow(degree, max_h - d) * dx
                double span = pow(degree, max_h - d) * dx;
                // 節點位於其佔據範圍的中心：(o * span) + (span / 2.0)
                custom_x[{d, o}] = (o * span) + (span / 2.0);
            }
            // 統一對齊：讓 Root 在 0 (雖然 root 必在 0.5*span，但減掉後能對齊 root_pos)
            if (nodes.count({0,0})) {
                double root_offset = custom_x[{0,0}];
                for (auto& p : custom_x) p.second -= root_offset;
            }
        }
        else if (mode == PREORDER) {
            double cursor = 0.0;
            std::function<void(int, int)> preorder = [&](int d, int o) {
                if (nodes.count({d, o}) == 0) return;
                // 自己
                custom_x[{d, o}] = cursor;
                cursor += dx;
                // 子節點
                for (int i = 0; i < degree; i++) preorder(d + 1, o * degree + i);
            };
            preorder(0, 0);
            if (nodes.count({0,0})) {
                double root_offset = custom_x[{0,0}];
                for (auto& p : custom_x) p.second -= root_offset;
            }
        }
        else if (mode == POSTORDER) {
            double cursor = 0.0;
            std::function<void(int, int)> postorder = [&](int d, int o) {
                if (nodes.count({d, o}) == 0) return;
                // 子節點
                for (int i = 0; i < degree; i++) postorder(d + 1, o * degree + i);
                // 自己
                custom_x[{d, o}] = cursor;
                cursor += dx;
            };
            postorder(0, 0);
            if (nodes.count({0,0})) {
                double root_offset = custom_x[{0,0}];
                for (auto& p : custom_x) p.second -= root_offset;
            }
        }

        // 更新樹的邊界資訊
        min_x = 1e9; max_x = -1e9;
        min_y = 1e9; max_y = -1e9;
        for (auto const& node : nodes) {
            Pos p = get_pos(node.first, node.second);
            double rx = p.x - root_pos.x;
            double ry = p.y - root_pos.y;
            min_x = min(min_x, rx); max_x = max(max_x, rx);
            min_y = min(min_y, ry); max_y = max(max_y, ry);
        }
    }

    // --- 定位與識別工具 ---
    Pos get_pos(int depth, int order) const {
        double offset = custom_x.count({depth, order}) ? custom_x.at({depth, order}) : 0.0;
        double level = depth * dy;
        Pos p = root_pos;
        if (horizontal) {
            p.x += level;
            p.y += offset;
        } else {
            p.x += offset;
            p.y += level;
        }
        return p;
    }
    string get_id(int d, int o) const { return prefix + "_" + to_string(d) + "_" + to_string(o); }
    string get_parent_id(int d, int o) const { return (d > 0) ? get_id(d - 1, o / degree) : ""; }

    // 萬用錨點工具：支援 "top", "bottom", "left", "right", "center" 等方位與偏移
    Pos anchor(int d, int o, string name, double dx = 0, double dy = 0) const {
        return Pos(get_id(d, o), name, dx, dy);
    }

    // 補足：讓 register_node 也能接收 string
    void register_node(AV& av, string val) {
        int d = curr_d, o = curr_o;
        while (d >= 0) {
            nodes.insert({d, o});
            d--; o /= degree;
        }
        vals[{curr_d, curr_o}] = val;
        update_layout();
        redraw(av);
    }

    // 更新計算結果並重繪
    void set_result(AV& av, int res) {
        results[{curr_d, curr_o}] = res;
        redraw(av);
    }

    Pos operator()(int depth, int order) const { return get_pos(depth, order); }
    Pos operator()(int index) const {
        if (index <= 0) return get_pos(0, 0);
        int d = 0; long long count = 1, sum = 1;
        while (index >= sum) { d++; count *= degree; sum += count; }
        return get_pos(d, (int)(index - (sum - count)));
    }
};

template<typename T>
ostream& operator<<(ostream& os, const vector<T>& v) {
    os << AV::array_to_string(v);
    return os;
}

#endif // AV_HPP
