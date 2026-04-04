# Prompt Master - Vibe Coding Assistant

## Project Requirement
Redesign the frontend UI/UX of a web application for developers who want better prompts when using vibe coding agents like Copilot or Antigravity. The goal is to provide a premium, modern, and aesthetically pleasing interface with rich design elements (dark mode, glassmorphism, dynamic micro-animations) to enhance the user experience while refining coding prompts.

## Functionality
- **Authentication**: Minimal username login and logout with `localStorage` persistence.
- **Projects Management**: Add new projects with a name and optional description. Select from a collapsible sidebar list of existing projects.
- **Interactive Chat Interface**: A chat flow between the user and an "assistant" (locally simulated) to refine prompts. Captures clarification answers or normal code requests.
- **Live Output Panel**: Real-time display of the final improved prompt, generated based on the conversation history. Includes a one-click copy to clipboard functionality.
- **Local Persistence**: Saves all users, projects, and chat messages in the browser context (`localStorage`).
