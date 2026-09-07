#ifndef ASM_TRACE_HPP
#define ASM_TRACE_HPP

#include <algorithm>
#include <array>
#include <cstdlib>
#include <deque>
#include <fstream>
#include <iomanip>
#include <list>
#include <map>
#include <queue>
#include <set>
#include <sstream>
#include <stack>
#include <string>
#include <type_traits>
#include <typeinfo>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

namespace asm_trace {

inline std::string escape(const std::string& value) {
  std::ostringstream out;
  for (unsigned char ch : value) {
    switch (ch) {
      case '"': out << "\\\""; break;
      case '\\': out << "\\\\"; break;
      case '\b': out << "\\b"; break;
      case '\f': out << "\\f"; break;
      case '\n': out << "\\n"; break;
      case '\r': out << "\\r"; break;
      case '\t': out << "\\t"; break;
      default:
        if (ch < 0x20) {
          out << "\\u" << std::hex << std::setw(4) << std::setfill('0') << static_cast<int>(ch) << std::dec;
        } else {
          out << ch;
        }
    }
  }
  return out.str();
}

inline std::string quoted(const std::string& value) {
  return std::string("\"") + escape(value) + "\"";
}

template <typename T>
typename std::enable_if<std::is_same<T, bool>::value, std::string>::type encode_scalar(const T& value) {
  return value ? "true" : "false";
}

template <typename T>
typename std::enable_if<std::is_arithmetic<T>::value && !std::is_same<T, bool>::value, std::string>::type encode_scalar(const T& value) {
  std::ostringstream out;
  out << std::setprecision(17) << value;
  return out.str();
}

inline std::string encode_scalar(const char& value) { return quoted(std::string(1, value)); }
inline std::string encode_scalar(const signed char& value) { return std::to_string(static_cast<int>(value)); }
inline std::string encode_scalar(const unsigned char& value) { return std::to_string(static_cast<unsigned int>(value)); }
inline std::string encode_scalar(const std::string& value) { return quoted(value); }
inline std::string encode_scalar(const char* value) { return quoted(value ? value : ""); }

template <typename T>
typename std::enable_if<std::is_arithmetic<T>::value, std::string>::type encode_value(const T& value) {
  return std::string("{\"kind\":\"scalar\",\"value\":") + encode_scalar(value) + "}";
}

inline std::string encode_value(const std::string& value) {
  return std::string("{\"kind\":\"string\",\"value\":") + quoted(value) + "}";
}

inline std::string encode_value(const char* value) {
  return encode_value(std::string(value ? value : ""));
}

template <typename T>
typename std::enable_if<!std::is_arithmetic<T>::value && !std::is_pointer<T>::value, std::string>::type
encode_value(const T& value);

template <typename T, typename Alloc>
std::string encode_value(const std::vector<T, Alloc>& value);
template <typename T, typename Alloc>
std::string encode_value(const std::deque<T, Alloc>& value);
template <typename T, typename Alloc>
std::string encode_value(const std::list<T, Alloc>& value);
template <typename T, std::size_t N>
std::string encode_value(const std::array<T, N>& value);
template <typename T, std::size_t N>
std::string encode_value(const T (&value)[N]);
template <typename A, typename B>
std::string encode_value(const std::pair<A, B>& value);

template <typename Iterator>
std::string encode_sequence(Iterator begin, Iterator end, const char* kind = "sequence") {
  std::ostringstream out;
  out << "{\"kind\":" << quoted(kind) << ",\"items\":[";
  bool first = true;
  for (Iterator it = begin; it != end; ++it) {
    if (!first) out << ',';
    first = false;
    out << encode_value(*it);
  }
  out << "]}";
  return out.str();
}

template <typename T, typename Alloc>
std::string encode_value(const std::vector<T, Alloc>& value) { return encode_sequence(value.begin(), value.end()); }

template <typename T, typename Alloc>
std::string encode_value(const std::deque<T, Alloc>& value) { return encode_sequence(value.begin(), value.end()); }

template <typename T, typename Alloc>
std::string encode_value(const std::list<T, Alloc>& value) { return encode_sequence(value.begin(), value.end()); }

template <typename T, std::size_t N>
std::string encode_value(const std::array<T, N>& value) { return encode_sequence(value.begin(), value.end()); }

template <typename T, std::size_t N>
std::string encode_value(const T (&value)[N]) { return encode_sequence(value, value + N); }

template <typename T, typename Compare, typename Alloc>
std::string encode_value(const std::set<T, Compare, Alloc>& value) { return encode_sequence(value.begin(), value.end(), "set"); }

template <typename T, typename Hash, typename Equal, typename Alloc>
std::string encode_value(const std::unordered_set<T, Hash, Equal, Alloc>& value) { return encode_sequence(value.begin(), value.end(), "set"); }

template <typename A, typename B>
std::string encode_value(const std::pair<A, B>& value) {
  return std::string("{\"kind\":\"pair\",\"items\":[") + encode_value(value.first) + ',' + encode_value(value.second) + "]}";
}

template <typename Iterator>
std::string encode_map(Iterator begin, Iterator end) {
  std::ostringstream out;
  out << "{\"kind\":\"map\",\"entries\":[";
  bool first = true;
  for (Iterator it = begin; it != end; ++it) {
    if (!first) out << ',';
    first = false;
    out << "{\"key\":" << encode_value(it->first) << ",\"value\":" << encode_value(it->second) << '}';
  }
  out << "]}";
  return out.str();
}

template <typename K, typename V, typename Compare, typename Alloc>
std::string encode_value(const std::map<K, V, Compare, Alloc>& value) { return encode_map(value.begin(), value.end()); }

template <typename K, typename V, typename Hash, typename Equal, typename Alloc>
std::string encode_value(const std::unordered_map<K, V, Hash, Equal, Alloc>& value) { return encode_map(value.begin(), value.end()); }

template <typename T, typename Container>
std::string encode_value(std::stack<T, Container> value) {
  std::vector<T> items;
  while (!value.empty()) { items.push_back(value.top()); value.pop(); }
  std::reverse(items.begin(), items.end());
  return encode_sequence(items.begin(), items.end(), "stack");
}

template <typename T, typename Container>
std::string encode_value(std::queue<T, Container> value) {
  std::vector<T> items;
  while (!value.empty()) { items.push_back(value.front()); value.pop(); }
  return encode_sequence(items.begin(), items.end(), "queue");
}

template <typename T>
std::string encode_value(T* const& value) {
  std::ostringstream address;
  if (value) address << static_cast<const void*>(value);
  return std::string("{\"kind\":\"reference\",\"address\":")
    + quoted(value ? address.str() : "null") + '}';
}

template <typename T>
typename std::enable_if<!std::is_arithmetic<T>::value && !std::is_pointer<T>::value, std::string>::type encode_opaque(const T& value) {
  std::ostringstream address;
  address << static_cast<const void*>(&value);
  return std::string("{\"kind\":\"object\",\"type\":") + quoted(typeid(T).name())
    + ",\"identity\":" + quoted(address.str()) + ",\"fields\":{}}";
}

template <typename T>
typename std::enable_if<!std::is_arithmetic<T>::value && !std::is_pointer<T>::value, std::string>::type
encode_value(const T& value) { return encode_opaque(value); }

struct NamedValue {
  std::string id;
  std::string name;
  std::string identity;
  std::string json;
};

template <typename T>
NamedValue named(const char* id, const char* name, const T& value) {
  std::ostringstream address;
  address << static_cast<const void*>(&value);
  return NamedValue{ id ? id : "", name ? name : "", address.str(), encode_value(value) };
}

class Recorder {
 public:
  Recorder() : event_id_(0), frame_id_(0), enabled_(false), max_frames_(5000) {
    const char* path = std::getenv("ASM_TRACE_FILE");
    if (!path || !*path) return;
    const char* max_frames = std::getenv("ASM_TRACE_MAX_FRAMES");
    if (max_frames) max_frames_ = std::max(1, std::atoi(max_frames));
    output_.open(path, std::ios::out | std::ios::trunc);
    enabled_ = output_.is_open();
    if (enabled_) output_ << "{\"record\":\"meta\",\"schemaVersion\":\"1.0\"}\n";
  }

  bool enabled() const { return enabled_; }

  void add_event(const std::string& type, int line, const std::string& signature,
                 const std::string& fields = std::string()) {
    if (!enabled_ || frame_id_ >= max_frames_) return;
    const int execution_order = event_id_++;
    std::ostringstream event;
    event << "{\"id\":" << quoted(std::string("event-") + std::to_string(execution_order))
          << ",\"order\":" << execution_order
          << ",\"type\":" << quoted(type)
          << ",\"signature\":" << quoted(signature)
          << ",\"line\":" << line;
    if (!fields.empty()) event << ',' << fields;
    event << '}';
    pending_events_.push_back(event.str());
  }

  template <typename... Values>
  void capture(int line, const char* function_name, const char* statement_id,
               const char* statement_kind, const Values&... values) {
    if (!enabled_ || frame_id_ >= max_frames_) return;
    std::vector<NamedValue> state{ values... };
    output_ << "{\"record\":\"frame\",\"id\":" << quoted(std::string("frame-") + std::to_string(frame_id_++))
            << ",\"source\":{\"line\":" << line
            << ",\"function\":" << quoted(function_name ? function_name : "")
            << ",\"statementId\":" << quoted(statement_id ? statement_id : "")
            << ",\"statementKind\":" << quoted(statement_kind ? statement_kind : "") << "}"
            << ",\"state\":{";
    for (std::size_t index = 0; index < state.size(); ++index) {
      if (index) output_ << ',';
      output_ << quoted(state[index].id) << ":{\"name\":" << quoted(state[index].name)
              << ",\"identity\":" << quoted(state[index].identity)
              << ",\"data\":" << state[index].json << '}';
    }
    output_ << "},\"events\":[";
    for (std::size_t index = 0; index < pending_events_.size(); ++index) {
      if (index) output_ << ',';
      output_ << pending_events_[index];
    }
    output_ << "]}\n";
    output_.flush();
    pending_events_.clear();
  }

 private:
  std::ofstream output_;
  std::vector<std::string> pending_events_;
  int event_id_;
  int frame_id_;
  bool enabled_;
  int max_frames_;
};

inline Recorder& recorder() {
  static Recorder instance;
  return instance;
}

inline std::string target_json(const char* role, const char* variable_id,
                               const char* expression, const char* index_expression,
                               bool has_resolved_index = false, long long resolved_index = 0) {
  std::string result = std::string("{\"role\":") + quoted(role ? role : "target")
    + ",\"variableId\":" + quoted(variable_id ? variable_id : "")
    + ",\"expression\":" + quoted(expression ? expression : "")
    + ",\"indexExpression\":" + quoted(index_expression ? index_expression : "");
  if (has_resolved_index) result += ",\"resolvedIndex\":" + std::to_string(resolved_index);
  return result + '}';
}

template <typename T>
inline void event_keep(int line, const char* signature, const char* variable_id,
                       const char* name, const char* label, const T& value,
                       bool preserve_style = true) {
  recorder().add_event("keep", line, signature ? signature : "",
    std::string("\"name\":") + quoted(name ? name : "")
      + ",\"label\":" + quoted(label ? label : "")
      + ",\"mode\":\"variable\""
      + ",\"preserveStyle\":" + (preserve_style ? "true" : "false")
      + ",\"payload\":{\"data\":" + encode_value(value) + "}"
      + ",\"targets\":[" + target_json("source", variable_id, name, "") + ']');
}

inline void event_keep_last(int line, const char* signature, const char* label,
                            bool preserve_style = true) {
  recorder().add_event("keep", line, signature ? signature : "",
    std::string("\"label\":") + quoted(label ? label : "")
      + ",\"mode\":\"last\""
      + ",\"preserveStyle\":" + (preserve_style ? "true" : "false")
      + ",\"targets\":[]");
}

inline void event_read(int line, const char* signature, const char* variable_id,
                       const char* expression, const char* index_expression) {
  recorder().add_event("read", line, signature ? signature : "",
    std::string("\"targets\":[") + target_json("target", variable_id, expression, index_expression) + ']');
}

template <typename T>
void event_declare(int line, const char* signature, const char* variable_id,
                   const char* name, const char* kind, const T& value) {
  recorder().add_event("declare", line, signature ? signature : "",
    std::string("\"name\":") + quoted(name ? name : "")
      + ",\"kind\":" + quoted(kind ? kind : "object")
      + ",\"payload\":{\"value\":" + encode_value(value) + "}"
      + ",\"targets\":[" + target_json("target", variable_id, name, "") + ']');
}

inline void event_declare_uninitialized(int line, const char* signature, const char* variable_id,
                                        const char* name, const char* kind) {
  recorder().add_event("declare", line, signature ? signature : "",
    std::string("\"name\":") + quoted(name ? name : "")
      + ",\"kind\":" + quoted(kind ? kind : "object")
      + ",\"payload\":{\"value\":null}"
      + ",\"targets\":[" + target_json("target", variable_id, name, "") + ']');
}

template <typename T>
void event_initialized_assign(int line, const char* signature,
                              const char* target_id, const char* target_expression, const char* target_index,
                              bool target_has_resolved_index, long long target_resolved_index,
                              const char* source_id, const char* source_expression, const char* source_index,
                              bool source_has_resolved_index, long long source_resolved_index,
                              const char* expression, const T& value) {
  const std::string encoded = encode_value(value);
  recorder().add_event("assign", line, signature ? signature : "",
    std::string("\"operation\":\"=\"")
      + ",\"animate\":true"
      + ",\"expression\":" + quoted(expression ? expression : "")
      + ",\"payload\":{\"before\":null,\"after\":" + encoded + ",\"source\":" + encoded + "}"
      + ",\"targets\":[" + target_json("target", target_id, target_expression, target_index,
          target_has_resolved_index, target_resolved_index)
      + ',' + target_json("source", source_id, source_expression, source_index,
          source_has_resolved_index, source_resolved_index) + ']');
}

template <typename F>
bool event_condition(int line, const char* signature, const char* condition_kind, F evaluate) {
  const bool result = evaluate();
  recorder().add_event("condition", line, signature ? signature : "",
    std::string("\"conditionKind\":") + quoted(condition_kind ? condition_kind : "Condition")
      + ",\"result\":" + (result ? "true" : "false"));
  return result;
}

template <typename F>
void event_write(int line, const char* signature, const char* variable_id,
                 const char* expression, const char* index_expression,
                 bool has_resolved_index, long long resolved_index,
                 const char* operation, F action, bool animate = true) {
  action();
  recorder().add_event("write", line, signature ? signature : "",
    std::string("\"operation\":") + quoted(operation ? operation : "")
      + ",\"animate\":" + (animate ? "true" : "false")
      + ",\"targets\":[" + target_json("target", variable_id, expression, index_expression,
          has_resolved_index, resolved_index) + ']');
}

template <typename BeforeFactory, typename F, typename AfterFactory>
void event_update(int line, const char* signature, const char* variable_id,
                   const char* expression, const char* index_expression,
                   bool has_resolved_index, long long resolved_index,
                   const char* operation, BeforeFactory before_factory,
                   F action, AfterFactory after_factory, bool animate = true) {
  const std::string before = encode_value(before_factory());
  action();
  const std::string after = encode_value(after_factory());
  recorder().add_event("write", line, signature ? signature : "",
    std::string("\"operation\":") + quoted(operation ? operation : "")
      + ",\"animate\":" + (animate ? "true" : "false")
      + ",\"update\":true"
      + ",\"payload\":{\"before\":" + before + ",\"after\":" + after + ",\"source\":" + after + "}"
      + ",\"targets\":[" + target_json("target", variable_id, expression, index_expression,
          has_resolved_index, resolved_index) + ']');
}

template <typename BeforeFactory, typename F, typename AfterFactory>
void event_assign(int line, const char* signature,
                   const char* target_id, const char* target_expression, const char* target_index,
                   bool target_has_resolved_index, long long target_resolved_index,
                   const char* source_id, const char* source_expression, const char* source_index,
                   bool source_has_resolved_index, long long source_resolved_index,
                   const char* expression, BeforeFactory before_factory, F action, AfterFactory after_factory,
                   bool animate = true) {
  const std::string before = encode_value(before_factory());
  action();
  const std::string after = encode_value(after_factory());
  recorder().add_event("assign", line, signature ? signature : "",
    std::string("\"operation\":\"=\"")
      + ",\"animate\":" + (animate ? "true" : "false")
      + ",\"expression\":" + quoted(expression ? expression : "")
      + ",\"payload\":{\"before\":" + before + ",\"after\":" + after + ",\"source\":" + after + "}"
      + ",\"targets\":[" + target_json("target", target_id, target_expression, target_index,
          target_has_resolved_index, target_resolved_index)
      + ',' + target_json("source", source_id, source_expression, source_index,
          source_has_resolved_index, source_resolved_index) + ']');
}

template <typename LeftFactory, typename RightFactory, typename Compare>
bool event_compare(int line, const char* signature,
                   const char* left_id, const char* left_expression, const char* left_index,
                   bool left_has_resolved_index, long long left_resolved_index,
                   const char* right_id, const char* right_expression, const char* right_index,
                   bool right_has_resolved_index, long long right_resolved_index,
                   const char* operation, LeftFactory left_factory, RightFactory right_factory, Compare compare) {
  auto&& left = left_factory();
  auto&& right = right_factory();
  const bool result = compare(left, right);
  recorder().add_event("compare", line, signature ? signature : "",
    std::string("\"operation\":") + quoted(operation ? operation : "")
      + ",\"result\":" + (result ? "true" : "false")
      + ",\"payload\":{\"left\":" + encode_value(left) + ",\"right\":" + encode_value(right) + "}"
      + ",\"targets\":[" + target_json("left", left_id, left_expression, left_index,
          left_has_resolved_index, left_resolved_index)
      + ',' + target_json("right", right_id, right_expression, right_index,
          right_has_resolved_index, right_resolved_index) + ']');
  return result;
}

template <typename F>
void event_swap(int line, const char* signature,
                 const char* left_id, const char* left_expression, const char* left_index,
                 bool left_has_resolved_index, long long left_resolved_index,
                 const char* right_id, const char* right_expression, const char* right_index,
                 bool right_has_resolved_index, long long right_resolved_index,
                 F action) {
  action();
  recorder().add_event("swap", line, signature ? signature : "",
    std::string("\"targets\":[") + target_json("left", left_id, left_expression, left_index,
        left_has_resolved_index, left_resolved_index)
      + ',' + target_json("right", right_id, right_expression, right_index,
        right_has_resolved_index, right_resolved_index) + ']');
}

inline void event_call(int line, const char* signature, const char* callee, const char* expression) {
  recorder().add_event("call", line, signature ? signature : "",
    std::string("\"callee\":") + quoted(callee ? callee : "")
      + ",\"expression\":" + quoted(expression ? expression : ""));
}

inline void event_function(int line, const char* signature, const char* function_name, bool entering) {
  recorder().add_event(entering ? "function-enter" : "function-exit", line, signature ? signature : "",
    std::string("\"function\":") + quoted(function_name ? function_name : ""));
}

template <typename... Values>
void capture(int line, const char* function_name, const char* statement_id,
             const char* statement_kind, const Values&... values) {
  recorder().capture(line, function_name, statement_id, statement_kind, values...);
}

}  // namespace asm_trace

#endif
