// AV.hpp
#ifndef AV_HPP
#define AV_HPP

#include <string>
#include <vector>
#include <fstream>
#include <iostream>
#include <cstdlib>
using namespace std;
using array_style = pair<vector<string>, vector<int>>;
using array2D_style = pair<vector<string>, vector<pair<int,int>>>;

class AV {
public:
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

    #define draw(...)           draw_impl(__LINE__, __VA_ARGS__)
    #define frame_draw(...)     frame_draw_impl(__LINE__, __VA_ARGS__)
    #define key_frame_draw(...) key_frame_draw_impl(__LINE__, __VA_ARGS__)

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


    static string relPos_to_absPos(const string& ID) {
        return "{ group: \"" + ID + "\", direction: \"center\" }";
    }

    static string relPos_to_absPos(const string& ID, const string& direction) {
        return "{ group: \"" + ID + "\", direction: \"" + direction + "\" }";
    }

    static string relPos_to_absPos(const string& ID, int x) {
        return "{ group: \"" + ID + "\", index: " + to_string(x) + " }";
    }

    static string relPos_to_absPos(const string& ID, int x, int y) {
        return "{ group: \"" + ID + "\", row: " + to_string(x) + ", col: " + to_string(y) + " }";
    }

    static string relPos_to_absPos(int x, int y) {
        return "{ x: " + to_string(x) + ", y: " + to_string(y) + " }";
    }

    void stop(){
        if (_frameCount > 0) {
            _stopFrames.push_back(_frameCount - 1);
        }
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
        if (_frameCount > 0) {
            _skipFrames.push_back(_frameCount - 1);
        }
    }

    void start_draw() {
        _content += "(function() {\n";
        _content += "    let track = 0;\n";
        _content += "    function renderFrame(f) {\n";
        _content += "        clearAllEditorHighlights();\n";
        _content += "        clearCanvas();\n";
        _content += "        switch(f) {\n";
    }
    
    void start_frame_draw(){
        _content += "            case " + to_string(_frameCount) + ":\n";
    }

    void text(
        const string text = "",
        const int offsetX = 0,
        const int offsetY = 0
    ) {
        _content += "                if (track === 0) {\n";
        _content += "                    ";
        _content += 
            "drawText(\"" + 
            escapeJS(text) + "\"" + ", " +
            to_string(offsetX) + ", " + 
            to_string(offsetY) + ");\n";
        _content += "                }\n";
    }

    void key_text(
        const string text = "",
        const int offsetX = 0,
        const int offsetY = 0
    ) {
        _content += "                if (track === 1) {\n";
        _content += "                    ";
        _content += 
            "drawText(\"" + 
            escapeJS(text) + "\"" + ", " +
            to_string(offsetX) + ", " + 
            to_string(offsetY) + ");\n";
        _content += "                }\n";
    }

    void colored_text(
        const vector<vector<string>> text,
        const int offsetX = 0,
        const int offsetY = 0
    ) {
        _content += "                if (track === 0) {\n";
        _content += "                    ";
        _content += 
            "drawColoredText(" + 
            VVS_to_string(text) + ", " +
            to_string(offsetX) + ", " + 
            to_string(offsetY) + ");\n";
        _content += "                }\n";
    }

    void key_colored_text(
        const vector<vector<string>> text,
        const int offsetX = 0,
        const int offsetY = 0
    ) {
        _content += "                if (track === 1) {\n";
        _content += "                    ";
        _content += 
            "drawColoredText(" + 
            VVS_to_string(text) + ", " +
            to_string(offsetX) + ", " + 
            to_string(offsetY) + ");\n";
        _content += "                }\n";
    }

    void arrow(
        const string& startSpecJS,   // 例如 R"({ group: "BIT", index: 1 })"
        const string& endSpecJS,     // 例如 R"({ group: "heap", index: 4 })"
        const vector<pair<string,string>>& style = {}
    ) {
        _content += "                if (track === 0) {\n";
        _content += "                    drawArrow(";
        _content += startSpecJS + ", ";
        _content += endSpecJS   + ", ";
        _content += "{ " + pair_string_to_object(style) + " }";
        _content += ");\n";
        _content += "                }\n";
    }

    void key_arrow(
        const string& startSpecJS,   // 例如 R"({ group: "BIT", index: 1 })"
        const string& endSpecJS,     // 例如 R"({ group: "heap", index: 4 })"
        const vector<pair<string,string>>& style = {}
    ) {
        _content += "                if (track === 1) {\n";
        _content += "                    drawArrow(";
        _content += startSpecJS + ", ";
        _content += endSpecJS   + ", ";
        _content += "{ " + pair_string_to_object(style) + " }";
        _content += ");\n";
        _content += "                }\n";
    }

    template<typename T>
    void frame_draw_impl(
        const int code_line,
        const string groupID,
        const int offsetX = 0,
        const int offsetY = 0,
        const vector<vector<T>>& matrix = {},
        const vector<array2D_style>& style = {},
        const vector<vector<int>>& range = {},
        const string draw_type = "normal",
        const int index = 0
    ) {
        _content += "                if (track === 0) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    ";
        _content += 
            "draw2DArray(\'" + 
            groupID + "\', " + 
            to_string(offsetX) + ", " + 
            to_string(offsetY) + ", " + 
            array2D_to_string(matrix) + ",  " + 
            array2Dstyle_to_object(style) + ", " + 
            array2D_to_string(range) + ",  " + 
            "\"" + draw_type + "\", " + 
            to_string(index) + ");\n";
        _content += "                }\n";
    }

    template<typename T>
    void frame_draw_impl(
        const int code_line,
        const string groupID,
        const int offsetX = 0,
        const int offsetY = 0,
        const vector<T>& num = {},
        const vector<array_style>& style = {},
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
        _content += "                if (track === 0) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    ";
        _content += 
            "drawArray(\'" + 
            groupID + "\', " + 
            to_string(offsetX) + ", " + 
            to_string(offsetY) + ", " + 
            array_to_string(num) + ",  " + 
            arraystyle_to_object(style) + ", " + 
            array_to_string(range) + ", " + 
            "\"" + draw_type + "\", " + 
            to_string(itemsPerRow) + ", " +
            to_string(index) + ", " +
            array_to_string(segment_lazy) + ",  " + 
            array_to_string(segment_sets) + ",  " + 
            array_to_string(segment_index) + ",  " + 
            array_to_string(segment_left) + ",  " + 
            array_to_string(segment_right) + ");\n";
        _content += "                }\n";
    }

    template<typename T>
    void key_frame_draw_impl(
        const int code_line,
        const string groupID,
        const int offsetX = 0,
        const int offsetY = 0,
        const vector<vector<T>>& matrix = {},
        const vector<array2D_style>& style = {},
        const vector<vector<int>>& range = {},
        const string draw_type = "normal",
        const int index = 0
    ) {
        _content += "                if (track === 1) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    ";
        _content += 
            "draw2DArray(\'" + 
            groupID + "\', " + 
            to_string(offsetX) + ", " + 
            to_string(offsetY) + ", " + 
            array2D_to_string(matrix) + ",  " + 
            array2Dstyle_to_object(style) + ", " + 
            array2D_to_string(range) + ",  " +
            "\"" + draw_type + "\", " + 
            to_string(index) + ");\n";
        _content += "                }\n";
        _keyFrames.push_back(_frameCount);
    }

    template<typename T>
    void key_frame_draw_impl(
        const int code_line,
        const string groupID,
        const int offsetX = 0,
        const int offsetY = 0,
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
        _content += "                if (track === 1) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    ";
        _content += 
            "drawArray(\'" + 
            groupID + "\', " + 
            to_string(offsetX) + ", " + 
            to_string(offsetY) + ", " + 
            array_to_string(num) + ",  " + 
            arraystyle_to_object(style) + ", " + 
            array_to_string(range) + ", " + 
            "\"" + draw_type + "\", " + 
            to_string(itemsPerRow) + ", " +
            to_string(index) + ", " +
            array_to_string(segment_lazy) + ",  " + 
            array_to_string(segment_sets) + ",  " + 
            array_to_string(segment_index) + ",  " + 
            array_to_string(segment_left) + ",  " + 
            array_to_string(segment_right) + ");\n";
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
        const string groupID,
        const int offsetX = 0,
        const int offsetY = 0,
        const vector<vector<T>>& matrix = {},
        const vector<array2D_style>& style ={},
        const vector<vector<int>>& range = {},
        const string draw_type = "normal",
        const int index = 0
    ) {
        _content += "            case " + to_string(_frameCount++) + ":\n";
        _content += "                if (track === 0) {\n";
        _content += "                    addEditorHighlight(" + to_string(code_line) + ");\n";
        _content += "                    ";
        _content += 
            "draw2DArray(\'" + 
            groupID + "\', " + 
            to_string(offsetX) + ", " + 
            to_string(offsetY) + ", " + 
            array2D_to_string(matrix) + ",  " + 
            array2Dstyle_to_object(style) + ", " +
            array2D_to_string(range) + ",  " + 
            "\"" + draw_type + "\", " +  
            to_string(index) + ");\n";
        _content += "                }\n";
        _content += "                break;\n";
    }

    template<typename T>
    void draw_impl(
        const int code_line,
        const string groupID,
        const int offsetX = 0,
        const int offsetY = 0,
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
        _content += "                    ";
        _content += 
            "drawArray(\'" + 
            groupID + "\', " + 
            to_string(offsetX) + ", " + 
            to_string(offsetY) + ", " + 
            array_to_string(num) + ",  " + 
            arraystyle_to_object(style) + ", " + 
            array_to_string(range) + ", " + 
            "\"" + draw_type + "\", " + 
            to_string(itemsPerRow) + ", " +
            to_string(index) + ", " +
            array_to_string(segment_lazy) + ",  " + 
            array_to_string(segment_sets) + ",  " + 
            array_to_string(segment_index) + ",  " + 
            array_to_string(segment_left) + ",  " + 
            array_to_string(segment_right) + ");\n";
        _content += "                }\n";
        _content += "                break;\n";
    }

    void end_draw() {
        _content += "        }\n";
        _content += "    }\n";
        _content += "    let currentFrame = 0;\n";
        _content += "    const totalFrames = " + to_string(_frameCount) + ";\n";
        _content += "    const keyFrames = " + array_to_string(_keyFrames) + ";\n";
        _content += "    const stopFrames = [" + integers_to_string(_stopFrames) + to_string(_frameCount-1) + "];\n";
        _content += "    const fastFrames = " + array_to_string(_fastFrames) + ";\n";
        _content += "    const fastonFrames = " + array_to_string(_fastonFrames) + ";\n";
        _content += "    const skipFrames = " + array_to_string(_skipFrames) + ";\n";
        _content += "\n";
        _content += "    function findNextKey(frame) {\n";
        _content += "        let L = 0, R = keyFrames.length - 1;\n";
        _content += "        let ans = (keyFrames.length > 0?keyFrames[keyFrames.length-1] : totalFrames - 1);\n";
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
        _content += "        let ans = (keyFrames.length > 0?keyFrames[0] : 0);\n";
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
        _content += "                track = 1;\n";
        _content += "                currentFrame = findNextKey(currentFrame);\n";
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
        _content += "        }\n";
        _content += "    };\n";
        _content += "    document.addEventListener('DOMContentLoaded', () => {\n";
        _content += "        CodeScript.reset();\n";
        _content += "    });\n";
        _content += "})();\n\n";
        
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
            tmp += stylelist[i].first + ": \"" + stylelist[i].second + "\"";
        }
        return tmp;
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
        for(int i=0;i<style.size();i++){
            tmp += " " + type[i] + ": \"" + style[i]+ "\",";
        }
        tmp += " elements: " + array_to_string(num);
        return tmp + "}";
    }

    string array2Dobject_to_string(const vector<string>& style,const vector<pair<int,int>>& num){
        string tmp = "{";
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

    string escapeJS(const string& s) {
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

    string VVS_to_string(const vector<vector<string>>& v){
        string tmp = "[";
        vector<string> board={"text","bg_color","font_color","font_size"};
        for (size_t i = 0; i < v.size(); ++i){
            if (i) tmp += ",";
            tmp += "{" + board[0] + ": \"" + escapeJS(v[i][0]) + "\"";
            for (size_t j = 1; j < v[i].size(); ++j){
                tmp += ", " + board[j] + ": \"" + v[i][j] + "\"";
            }
            tmp += "}";
        }
        tmp += "]";
        return tmp;
    }

};

template<typename T>
ostream& operator<<(ostream& os, const vector<T>& v) {
    os << AV::array_to_string(v);
    return os;
}

#endif // AV_HPP
