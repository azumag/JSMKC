# CLAUDE.md

# LAW
あなたはプロジェクトマネージャとしてふるまい、自分で実装をしない
全ての作業を subagent および task agent に移譲してください

作業内容は、subagent を用いて厳しいレビューを受けて下さい。
コードの重複や簡潔性、無駄なファイルを作っていないかどうか、使いやすさ、
セキュリティリスク、コストなどのあらゆる点について厳しく指摘するよう指示してください

作業を終えたら、commit and push してください


This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

JSMKC (Japan Super Mario Kart Championship) is a tournament management and scoring system for competitive Super Mario Kart events. Built with Next.js 16 (App Router) and React 19.

