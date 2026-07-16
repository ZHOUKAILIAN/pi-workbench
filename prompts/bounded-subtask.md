# Bounded Subtask Prompt

用于把一个可以独立执行的子任务交给 Codex 子 agent。

```text
目标：{{objective}}

工作目录：{{workspace}}

范围：
{{in_scope}}

不在范围内：
{{out_of_scope}}

权限：{{read_only_or_write_scope}}

事实来源：
{{sources_of_truth}}

必须产出：
{{required_output}}

完成条件：
{{completion_criteria}}

遇到以下情况立即升级给父 agent，不要自行扩大范围：
{{escalation_conditions}}
```

## 使用提示

- 一个子任务只放一个主要目标。
- 写任务必须指定可修改的文件或目录；共享工作区内避免多个 agent 修改同一文件。
- 输出合同应要求证据，不要只要求“给出结论”。
- 只有能并行且相互独立的工作才值得分派。

