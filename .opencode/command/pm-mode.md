# pm-mode.md - PM Mode Commands for Tmux Pane Collaboration

## Pane Management Commands

### Create 3-pane PM mode layout
```bash
# Create vertical split
tmux split-pane -h

# Select right pane and create horizontal split
tmux select-pane -t 1 && tmux split-pane -v

# Start claude in top-right pane (pane 1)
tmux send-keys -t 1 "claude" C-m

# Wait and then press Enter to ensure claude starts
sleep 3 && tmux send-keys -t 1 C-m C-m

# Start gemini in bottom-right pane (pane 2)
tmux send-keys -t 2 "gemini" C-m

# Wait and then press Enter to ensure gemini starts
sleep 3 && tmux send-keys -t 2 C-m C-m
```

### Send commands to panes
```bash
# Send to architect pane (pane 1)
tmux send-keys -t 1 "your message here" C-m

# Send to reviewer pane (pane 2)
tmux send-keys -t 2 "your message here" C-m

# Send multi-line messages with proper escaping
tmux send-keys -t 1 "Line 1\nLine 2\nLine 3" C-m

# For complex messages, use heredoc approach:
tmux send-keys -t 1 "$(cat <<'EOF'
This is a multi-line message
with proper formatting
and multiple paragraphs
EOF
)" C-m
```

### Monitor pane activity
```bash
# Show all panes with their numbers
tmux list-panes

# Capture and display pane output
tmux capture-pane -p -t 1  # Show architect pane
tmux capture-pane -p -t 2  # Show reviewer pane

# Monitor all panes in real-time
watch -n 1 'tmux capture-pane -p -t 0; echo "---"; tmux capture-pane -p -t 1; echo "---"; tmux capture-pane -p -t 2'
```

## PM Mode Workflow Commands

### 1. Initial Setup
```bash
# Create PM mode workspace
tmux new-session -s pm-session

# Apply PM mode layout
# (Use the commands from "Create 3-pane PM mode layout" section)
```

### 2. Task Assignment Template
```bash
# Send task to architect with clear instructions
tmux send-keys -t 1 "$(cat <<'EOF'
ARCHITECT TASK: [Task Description]

Context: [Provide relevant context]
Requirements: [List specific requirements]

Please analyze and provide:
1. Technical approach
2. Architecture considerations
3. Potential risks

When complete, report back with:
tmux send-keys -t 0 "[Analysis results]" C-m C-m
EOF
)" C-m

# Send task to reviewer with clear instructions
tmux send-keys -t 2 "$(cat <<'EOF'
REVIEW TASK: [Task Description]

Focus on:
- Security implications
- Performance considerations
- Code quality issues
- Edge cases

When complete, report back with:
tmux send-keys -t 0 "[Review results]" C-m C-m
EOF
)" C-m
```

### 3. Local LLM Integration
```bash
# Use LFM2.5 for implementation tasks
~/work/llama.cpp/build/bin/llama-cli \
  -m models/LFM2.5-1.2B-Instruct-Q4_K_M.gguf \
  -p "Your prompt here" \
  --single-turn

# Create reusable function for LLM calls
llm_prompt() {
  ~/work/llama.cpp/build/bin/llama-cli \
    -m models/LFM2.5-1.2B-Instruct-Q4_K_M.gguf \
    -p "$1" \
    --single-turn
}

# Usage example
llm_prompt "Create a React component for image upload with drag and drop support"
```

### 4. Test Execution Commands
```bash
# Run E2E tests with Playwright
npm run test:e2e

# Run specific test files
npx playwright test e2e/image-upload.spec.ts

# Run tests on specific browser
npx playwright test --project=chromium

# Run tests with debugging
npx playwright test --debug

# Generate test report
npx playwright test --reporter=html
```

## Troubleshooting Commands

### Fix common issues
```bash
# If claude/gemini not responding, restart them
tmux send-keys -t 1 C-c
sleep 1
tmux send-keys -t 1 "claude" C-m

tmux send-keys -t 2 C-c
sleep 1
tmux send-keys -t 2 "gemini" C-m

# If pane gets stuck, reset it
tmux kill-pane -t 1
tmux split-pane -h
tmux send-keys -t 1 "claude" C-m

# Clear pane output
tmux send-keys -t 1 clear C-m
tmux send-keys -t 2 clear C-m
```

### Check pane status
```bash
# List all sessions
tmux list-sessions

# Check pane numbers and sizes
tmux list-panes -a

# Show current session
tmux display-message -p '#S: #I.#P'
```

## Best Practices

1. **Always wait for responses** between sending commands to different panes
2. **Use proper escaping** for special characters in messages
3. **Monitor pane activity** regularly to ensure tasks are progressing
4. **Keep messages concise** to avoid overwhelming the AI assistants
5. **Use clear task boundaries** when assigning work to different panes
6. **Save important outputs** from panes for documentation
7. **Test commands individually** before using in automated workflows

## Example: Complete E2E Test Workflow
```bash
# 1. Send analysis task to architect
tmux send-keys -t 1 "Analyze the existing E2E tests in e2e/image-upload.spec.ts and identify potential issues or improvements" C-m

# 2. Wait for response, then send to reviewer
sleep 30
tmux send-keys -t 2 "Review the test coverage and security aspects of the image upload tests. Focus on authentication and file validation" C-m

# 3. Run tests after analysis
npm run test:e2e

# 4. If tests fail, get LLM help
llm_prompt "Fix the failing image upload E2E test. The test is failing at file validation step"

# 5. Send fix for review
tmux send-keys -t 2 "Review this test fix: [paste fix here]. Check for proper error handling and edge cases" C-m
```