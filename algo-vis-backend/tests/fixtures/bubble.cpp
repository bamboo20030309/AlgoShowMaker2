#include <bits/stdc++.h>
using namespace std;
int main() {
    int n; cin >> n;
    vector<int> arr(n);
    for (auto &v : arr) cin >> v;
    // @frame arr
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                swap(arr[j], arr[j + 1]);
            }
            // swap: @frame arr[j,j+1]
        }
        // @keep last
    }
    // @frame arr
    return 0;
}
