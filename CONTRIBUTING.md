# ScoreFlow — Contribution Guide

Welcome to the ScoreFlow team!

This guide explains how to get the project, create your own branch, work on your task, and raise a Pull Request.

**Important:** If you are doing Git/GitHub for the first time, follow the steps exactly.

---

## 1. One-Time Setup

### Install these

Before starting, install:

- Git
- Node.js
- VS Code

Check installation:

```bash
git --version
node --version
npm --version
```

---

# 2. Clone the Repository

Open PowerShell or VS Code Terminal.

Go to the location where you want to keep the project.

Example:

```bash
cd C:\
```

Clone the repository:

```bash
git clone https://github.com/satyammishra8-1/Scoreflow.git
```

Go inside the project:

```bash
cd Scoreflow
```

---

# 3. Check the Branch

The project uses two important branches:

```text
main → stable/final code
dev  → team development
```

**Never directly work on `main`.**

Switch to `dev`:

```bash
git checkout dev
```

Get the latest code:

```bash
git pull origin dev
```

---

# 4. Create Your Own Feature Branch

Every task must have its own branch.

Example:

```bash
git checkout -b feature/login-page
```

Other examples:

```bash
feature/judge-dashboard
feature/team-import
feature/event-api
feature/ai-feedback
feature/email-service
```

### Branch naming

Use:

```text
feature/<short-task-name>
```

Examples:

```text
feature/login
feature/event-management
feature/judge-form
feature/results
```

---

# 5. Start Your Work

First make sure you are on your feature branch:

```bash
git branch
```

You should see:

```text
* feature/login
  dev
  main
```

The `*` shows your current branch.

Now work only on the task assigned to you.

---

# 6. Before Starting Work Each Day

Always get the latest `dev` code.

If you are already on your feature branch:

```bash
git checkout dev
git pull origin dev
git checkout feature/your-branch-name
```

This helps you work with the latest team code.

---

# 7. Save Your Work

After completing a small part of your task:

Check what changed:

```bash
git status
```

Add your changes:

```bash
git add .
```

Create a commit:

```bash
git commit -m "feat: add login page"
```

### Commit message format

Use:

```text
feat:    → new feature
fix:     → bug fix
chore:   → setup/configuration
docs:    → documentation
refactor: → code improvement
```

Examples:

```bash
git commit -m "feat: add judge evaluation form"
git commit -m "fix: resolve login validation"
git commit -m "chore: update project configuration"
git commit -m "docs: update API documentation"
```

---

# 8. Push Your Branch

First time:

```bash
git push -u origin feature/your-branch-name
```

Example:

```bash
git push -u origin feature/login
```

After the first push, you can simply use:

```bash
git push
```

---

# 9. Create a Pull Request

Go to the ScoreFlow GitHub repository.

GitHub will usually show:

**Compare & pull request**

Click it.

Set:

```text
base: dev
compare: feature/your-branch
```

### IMPORTANT

Your Pull Request must be:

```text
feature/your-branch
        ↓
       dev
```

**NOT:**

```text
feature/your-branch
        ↓
       main
```

---

# 10. Pull Request Description

Explain briefly:

### What did you change?

Example:

```text
Added login page with email and password fields.
```

### What did you test?

Example:

```text
Tested login form validation locally.
```

### Screenshots

If you changed the UI, add screenshots.

---

# 11. Wait for Review

After creating the Pull Request:

**Do not merge it yourself.**

The team lead will review the code.

Possible results:

```text
Approved → Merge
Changes requested → Fix → Push again
```

If changes are requested:

```bash
# Make the requested changes

git add .
git commit -m "fix: address review comments"
git push
```

The same Pull Request will automatically update.

---

# 12. After Your PR Is Merged

Once your Pull Request is merged into `dev`:

Switch back:

```bash
git checkout dev
```

Get the latest code:

```bash
git pull origin dev
```

Now create your next branch:

```bash
git checkout -b feature/next-task
```

---

# 13. Golden Rules

### Rule 1

Never push directly to `main`.

### Rule 2

Never push directly to `dev`.

### Rule 3

Every task gets its own feature branch.

### Rule 4

Always pull the latest `dev` before starting new work.

### Rule 5

Make small, meaningful commits.

### Rule 6

Test your code before creating a Pull Request.

### Rule 7

Never commit:

```text
.env
API keys
passwords
MongoDB credentials
secrets
```

### Rule 8

Don't modify another person's feature without discussing it first.

### Rule 9

If you are stuck, ask the team instead of randomly changing code.

---

# 14. Complete Workflow

Remember this:

```text
Clone
  ↓
checkout dev
  ↓
pull latest code
  ↓
create feature branch
  ↓
write code
  ↓
test
  ↓
git add .
  ↓
git commit
  ↓
git push
  ↓
Create Pull Request
  ↓
Team Lead Review
  ↓
Fix if required
  ↓
Merge into dev
  ↓
Pull latest dev
  ↓
Start next task
```

---

# 15. Example — Complete Flow

Suppose your task is:

**Create Judge Dashboard**

Start:

```bash
git checkout dev
git pull origin dev
git checkout -b feature/judge-dashboard
```

Work on the dashboard.

Then:

```bash
git status
git add .
git commit -m "feat: add judge dashboard"
git push -u origin feature/judge-dashboard
```

Go to GitHub → Create Pull Request:

```text
feature/judge-dashboard → dev
```

Wait for review.

After approval, the team lead merges it.

Then:

```bash
git checkout dev
git pull origin dev
```

You are ready for your next task.

---

# 16. If You Make a Mistake

**Don't panic and don't delete random files.**

Tell the team lead what happened.

For example:

```text
I accidentally committed something wrong.
```

or:

```text
I have a Git merge conflict.
```

We will fix it together.

---

# ScoreFlow Team Rule

**Small task → Feature branch → Test → Commit → Push → Pull Request → Review → Merge**

Follow this process for every contribution.