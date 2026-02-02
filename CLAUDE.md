# CLAUDE.md

# BASE
- Detailed comments must be included in the source code to justify the implementation of such logic

# LAW
具体的作業をできるだけ subagent に委任し、コンテキストウィンドウを節約すること.
作業内容は、subagent を用いて厳しいレビューを受けて下さい。
コードの重複や簡潔性、無駄なファイルを作っていないかどうか、使いやすさ、
セキュリティリスク、コストなどのあらゆる点について厳しく指摘するよう指示してください

## review aspects
- Code quality and best practices
- Potential bugs and edge cases
- Performance implications
- Security considerations
- **コードの簡潔性**: 過度な抽象化や複雑化を避ける
- 単体テストのカバレッジは十分か？
- YAGNI の原則に乗っ取り、過剰な実装と設計を避ける

# Project Overview

JSMKC (Japan SMK Championship) is a tournament management and scoring system for competitive SMK events. Built with Next.js 16 (App Router) and React 19.

## SRC
under `./jsmkc-app`