#include <bits/stdc++.h>
using namespace std;
int main() {
    int n; cin >> n;
    vector<int> arr(n);
    for (auto &v : arr) cin >> v;
    // @frame arr
    for (int i = 1; i < n; i++) {
        int key = arr[i];
        int j = i - 1;
        // pick: @frame arr[i,j],key
        while (j >= 0 && arr[j] > key) {
            arr[j+1] = arr[j];
            j--;
            // shift: @frame arr[i,j],key
        }
        arr[j+1] = key;
        // insert: @frame arr[i,j],key
    }
    // @frame arr
    return 0;
}
