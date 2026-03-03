# TUI Message Order - Before/After Comparison

## The Bug

When using the TUI with streaming responses, user messages would appear BELOW
the assistant's streaming response instead of above it.

## Before Fix (stickyStart="bottom")

````
+-----------------------------------------------------------------+
| * openhei                                                      |
+-----------------------------------------------------------------+
|                                                                 |
|  (empty or earlier messages...)                                |
|                                                                 |
|  +- ASSISTANT ------------------------------------------------+ |
|  | Here's a simple hello world function in Python:            | |
|  | ```python     [████████████████████░░░░░░░░░░░░░░░░░░░░░░ | |
|  | (streaming...)                                            | |
|  +-----------------------------------------------------------+ |
|  +- USER ----------------------------------------------------+ |
|  | Write a hello world function in Python  <- Appears BELOW  | |
|  +-----------------------------------------------------------+ |
|                                                                 |
|  > _                                                            |
+-----------------------------------------------------------------+
                            ^
                   WRONG ORDER
````

## After Fix (stickyStart="top")

````
+-----------------------------------------------------------------+
| * openhei                                                      |
+-----------------------------------------------------------------+
|                                                                 |
|  +- USER ----------------------------------------------------+ |
|  | Write a hello world function in Python                     | |
|  +-----------------------------------------------------------+ |
|                                                                 |
|  +- ASSISTANT ------------------------------------------------+ |
|  | Here's a simple hello world function in Python:            | |
|  | ```python                                                  | |
|  | def hello_world():     [███████████████████████░░░░░░░░░░ | |
|  | (streaming...)                                                | |
|  +-----------------------------------------------------------+ |
|                                                                 |
|  > _                                                            |
+-----------------------------------------------------------------+
                            ^
                   CORRECT ORDER
````

## Why It Happens

- The TUI uses `react-sticky-headroom` for sticky scrolling
- `stickyStart="bottom"` made the scroll anchor at the bottom
- When assistant started streaming, the scroll pushed user messages UP
- With `stickyStart="top"`, the anchor is at the top, keeping messages visible
