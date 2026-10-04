# ScoreFlow

### Competition Evaluation & Feedback Automation System

ScoreFlow is a web-based platform designed to simplify and automate the evaluation process for **college hackathons and project exhibitions**.

It helps organizers manage events, teams, judges, evaluation criteria, scoring, results, and post-event feedback from one centralized system.

---

## 📌 What Problem Are We Solving?

In many college competitions, evaluation is still handled manually using spreadsheets or paper forms.

This creates problems such as:

- Difficult to manage a large number of teams and judges
- Manual score calculation
- Chances of calculation errors
- Difficult to maintain consistent evaluation
- Time-consuming result preparation
- No structured feedback for participating teams
- Sending individual result emails manually takes time

**ScoreFlow aims to make this entire process faster, organized, reliable, and scalable.**

---

## 🎯 What Does ScoreFlow Do?

The basic workflow is:

```text
Admin creates competition
        ↓
Admin defines evaluation criteria & weights
        ↓
Team details are uploaded
        ↓
Judges are added and assigned
        ↓
Judges evaluate teams
        ↓
Scores are automatically calculated
        ↓
Admin finalizes the results
        ↓
AI analyzes scores & judge feedback
        ↓
Personalized feedback is generated
        ↓
Each team receives its result + feedback by email
```

---

## 👥 Users

ScoreFlow has two main types of users:

### Admin

The Admin manages the complete competition.

Admin can:

- Create competitions
- Define evaluation criteria
- Set criteria weights
- Add/import teams
- Add judges
- Assign judges to teams
- Monitor evaluations
- Finalize results
- Trigger feedback generation
- Send result emails

### Judge

Judges are responsible for evaluating teams.

Judges can:

- View assigned teams
- View evaluation criteria
- Enter scores
- Add comments/feedback
- Submit evaluations

> Students/participants do not need to create accounts or use a separate dashboard.

---

## 🤖 AI Feature

AI is used **after the evaluation process**, not to replace the judges.

The AI receives structured information such as:

- Team scores
- Individual criterion scores
- Judge comments
- Strengths
- Weak areas

It then generates **personalized and useful improvement feedback** for each team.

Example:

```text
Team: Team Alpha

Strength:
Strong technical implementation and good problem understanding.

Improvement:
The solution could improve scalability and provide a clearer
user experience.

Suggestion:
Consider optimizing the API architecture and improving the
frontend workflow for future versions.
```

The generated feedback is included in the team's final result email.

---

## ⭐ Main Features

### Event Management
Create and manage hackathons and project exhibitions.

### Team Management
Upload and manage team information such as:

- Team number
- Team name
- Member names
- Email addresses
- GitHub links
- Demo links

### Evaluation Criteria
Admins can define:

- Criteria
- Maximum scores
- Weights

### Judge Management
Add judges and assign them to teams.

### Digital Evaluation
Judges can evaluate teams through a structured scorecard.

### Automatic Score Calculation
The system calculates scores according to the configured criteria and weights.

### Result Finalization
Admins can review and finalize competition results.

### AI Feedback
AI generates personalized suggestions based on evaluation results and judge feedback.

### Automated Email
Each team receives a personalized email containing:

- Final score
- Score breakdown
- Evaluation information
- AI-generated feedback

### Audit & Tracking
Important actions can be tracked for reliability and accountability.

---

## 🏗️ System Overview

```text
                    ┌──────────────────┐
                    │     Admin UI     │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │    React App     │
                    └────────┬─────────┘
                             │
                         REST API
                             │
                    ┌────────▼─────────┐
                    │ Node + Express   │
                    │     Backend      │
                    └──────┬─────┬─────┘
                           │     │
                 ┌─────────┘     └─────────┐
                 ▼                         ▼
          ┌─────────────┐           ┌─────────────┐
          │  MongoDB    │           │ AI Service  │
          │   Database  │           │   FastAPI   │
          └─────────────┘           └──────┬──────┘
                                           │
                                           ▼
                                      AI / LLM
                                          
                    Backend
                       │
                       ▼
                 Email Service
                       │
                       ▼
                    Teams
```

---

## 🛠️ Technology Stack

### Frontend

- React
- Vite
- React Router
- Axios
- Tailwind CSS

### Backend

- Node.js
- Express.js
- MongoDB
- Mongoose
- JWT Authentication

### AI Service

- Python
- FastAPI
- LLM API

### Development & Deployment

- Git
- GitHub
- Docker
- MongoDB Atlas

---

## 📁 Project Structure

```text
ScoreFlow/
│
├── client/              # React frontend
│
├── server/              # Node.js + Express backend
│
├── ai-service/          # Python + FastAPI AI service
│
├── docs/                # Project documentation
│
├── README.md            # Project overview
│
├── CONTRIBUTING.md      # Team contribution guide
│
└── .gitignore
```

---

## 🔄 Development Workflow

We use GitHub for collaboration.

```text
dev
 │
 ├── feature/frontend
 ├── feature/backend
 ├── feature/judging
 ├── feature/ai
 └── feature/email
```

Basic workflow:

```text
Pull latest dev
      ↓
Create feature branch
      ↓
Work on assigned task
      ↓
Test locally
      ↓
Commit changes
      ↓
Push branch
      ↓
Create Pull Request
      ↓
Code Review
      ↓
Merge into dev
```

**Never push directly to `main` or `dev`.**

For complete instructions, read:

👉 `CONTRIBUTING.md`

---

## 🚀 Development Status

ScoreFlow is currently under active development.

### Current Stage

- [x] GitHub repository setup
- [x] Basic frontend setup
- [x] Basic backend setup
- [x] Project structure
- [ ] Authentication
- [ ] Event management
- [ ] Team management
- [ ] Judge management
- [ ] Evaluation system
- [ ] Result calculation
- [ ] AI feedback
- [ ] Email automation
- [ ] Testing
- [ ] Deployment

---

## 👨‍💻 Team

| Member | Responsibility |
|---|---|
| Satyam Mishra | Project Lead / Architecture |
| Team Member | Frontend |
| Team Member | Backend |
| Team Member | Evaluation System |
| Team Member | AI & Automation |

Update this table with the actual team members and responsibilities.

---

## 📌 Important

This project is being developed as a **production-oriented system**, not just a basic college prototype.

While implementing features, we will focus on:

- Clean architecture
- Scalability
- Security
- Maintainability
- Proper Git workflow
- Testing
- Reliable data handling
- Clear separation between services

---

## 📖 Documentation

- `README.md` → Understand the project
- `CONTRIBUTING.md` → Learn how to contribute
- `docs/PROJECT_PLAN.md` → Detailed development plan

---

## License

This project is currently developed as a team project for educational and development purposes.