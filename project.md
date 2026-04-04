# Vibe Coding Prompt Assistant

## Overview

A frontend-only web app for developers who want better prompts when using vibe coding agents like Copilot or Antigravity. The app provides:
- minimal username login/auth
- per-user projects with name and description
- project-specific chat history and conversation flow
- guided prompt improvement through iterative clarification
- live final prompt updates in a dedicated side panel
- browser persistence via `localStorage`

## Goals

1. let users login and access their own dashboard
2. allow users to create and manage projects with descriptions
3. enable chat-based prompt refinement per project
4. update the final prompt in real-time as the conversation progresses
5. keep the app frontend-only with local persistence

## Key UX Features

- **Header**: Sticky navbar with "Prompt Master" brand, current project name, user profile and logout
- **Collapsible Project Sidebar**: Left navigation showing all projects with toggle to collapse/expand
- **Chat Panel (Left)**: Conversation interface where users and assistant exchange prompts and clarifications
- **Final Prompt Panel (Right)**: Live-updating panel showing the latest refined prompt ready for the coding agent
- **Clear Chat Flow**: Messages are visually distinguished by sender (user vs assistant), with clarifications highlighted

## User Stories

- As a user, I can login with my username and see only my projects.
- As a user, I can collapse the project sidebar to focus on the chat.
- As a user, I can create a new project with a name and optional description.
- As a user, I can open a project and send prompts to the assistant.
- As a user, the assistant asks clarification questions if the prompt is incomplete.
- As a user, I can see my previous chats in each project.
- As a user, I can watch the final improved prompt update in the right panel as I chat.
- As a user, I can copy the final prompt for use in a vibe coding assistant.

## Core Features

- Login screen with simple username authentication
- Modern Bootstrap 5 dashboard layout
- Collapsible left sidebar for projects
- Sticky header with brand and user controls
- Chat panel with message history and new prompt input
- Real-time final prompt panel that updates with each exchange
- Persistent user data in `localStorage`

## Recommended Architecture

- React + TypeScript + Vite for frontend speed and simplicity
- Bootstrap 5 for layout and modern UI styling
- `localStorage` for user data and chat history
- Single-page app with simulated routes via component state
- Flexbox layout for responsive, collapsible design

## Data Model

- `User`:
  - `username`
  - `projects`
- `Project`:
  - `id`
  - `name`
  - `description`
  - `chats`
- `ChatMessage`:
  - `id`
  - `sender` (`user` | `assistant`)
  - `content`
  - `timestamp`
  - `type` (`prompt` | `clarification` | `result` | `note`)

## Implementation Plan

1. bootstrap app with Vite and React ✓
2. add Bootstrap 5 styling and page layout ✓
3. build login/user persistence ✓
4. build collapsible project sidebar ✓
5. build chat UI with real-time message rendering ✓
6. build final prompt panel that updates live ✓
7. refine styles for accessibility and polish ✓

## Next Steps

- run `npm run dev` to start the dev server
- review the new split-panel UX
- test collapsible sidebar and chat flow
- extend with real LLM or service integration later

