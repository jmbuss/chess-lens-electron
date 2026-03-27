# AI Context Folder

This folder contains project-specific context, guidelines, and documentation that helps AI assistants understand the codebase better.

## Purpose
Files in this folder are automatically loaded into the AI context to provide:
- Project architecture and design decisions
- Development patterns and conventions
- Domain-specific knowledge (chess rules, game logic, etc.)
- API documentation and integration notes
- Common workflows and best practices

## Usage
Add any relevant documentation, guidelines, or context files here. They will be automatically considered when working on this project.

## Current Contents
- `README.md` - This file
- `components/` - Component guidelines and structure documentation
  - `vue-component-structure.md` - Vue component structure and auto-complete guidelines
- `api/` - API development guidelines
  - `api-creation-guide.md` - Guide for creating IPC-based APIs using the user API as an example
- `features/` - Feature implementation plans
  - `chess-analysis-architecture.md` - State-machine architecture for the game analysis engine (XState, criticality scoring, vector similarity)
  - `games-table-sorting-filtering.md` - Plan for client-side sorting and filtering on the games table
