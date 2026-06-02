```
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
```

## Repository Purpose
This repository contains the CCShop customization package that transforms standard Claude Code into an e-commerce specialized intelligent agent "🛍️ CCShop".

## Core File
- `CCShop 自动魔改指令包 (给 CC 读取的脚本).md` - The main instruction script that contains all steps to configure CCShop.

## Key Commands & Tasks
The script includes 5 main configuration tasks:

1. **Inject welcome announcements** - Modify `~/.claude/settings.json` to add CCShop welcome messages
2. **Apply branding patch** - Run `npx tweakcc adhoc-patch --string '"Claude Code"' '"🛍️ CCShop"'` to rename the interface
3. **Configure theme** - Create `~/.tweakcc/config.json` with coral orange theme and e-commerce thinking verbs
4. **Inject system prompts** - Add e-commerce core skills and security directives to `~/.tweakcc/system-prompts/main.md`
5. **Apply configuration** - Run `npx tweakcc --apply` to compile and activate all changes

## Architecture Notes
- This is a configuration-only repository that customizes the Claude Code CLI using the `tweakcc` tool
- No application code is stored here - it's purely a set of customization instructions
- The resulting CCShop agent has 10 core e-commerce skills:
  1. Product selection and testing analysis
  2. Competitor traffic and price reverse engineering
  3. High-conversion product detail page copy generation
  4. ROI and profit margin calculation
  5. SEO keyword layout for internal and external sites
  6. High EQ customer service scripts for after-sales disputes
  7. Promotion (Double 11/Black Friday) marketing rhythm planning
  8. User review (VOC) sentiment analysis
  9. Supply chain and inventory turnover recommendations
  10. E-commerce platform compliance review

## Security Note
The CCShop agent includes a highest-priority security directive to protect user e-commerce data and prohibit uploading sensitive business data to untrusted third-party networks.
