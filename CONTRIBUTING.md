# How to Contribute to ScoreFlow

Follow these steps to contribute to the project.

### 1. Clone the Repository

```bash
git clone https://github.com/satyammishra8-1/Scoreflow.git
cd Scoreflow
```

### 2. Switch to Dev Branch

```bash
git checkout dev
git pull origin dev
```

### 3. Create Your Own Branch

```bash
git checkout -b feature/your-task-name
```

Example: `feature/judge-dashboard`

### 4. Make Your Changes

Complete your assigned task and test your code.

### 5. Commit Your Changes

```bash
git add .
git commit -m "feat: describe your changes"
```

### 6. Push Your Branch

```bash
git push -u origin feature/your-task-name
```

### 7. Create a Pull Request

- Open the ScoreFlow repository on GitHub.
- Click **Compare & Pull Request**.
- Select `dev` as the base branch.
- Select your feature branch as the compare branch.
- Add a short description and click **Create Pull Request**.

### Important Rules

- Never push directly to `main` or `dev`.
- Always create your own feature branch.
- Never commit `.env` files or API keys.
- Wait for the team lead to review and merge your PR.

**Workflow:** Clone → Dev → Feature Branch → Code → Commit → Push → Pull Request → Review.

## How to Run ScoreFlow Locally

ScoreFlow has three parts that run separately:

1. Frontend (React + Vite)
2. Backend (Node.js + Express)
3. AI Service (Python + FastAPI)

**Important:** Open three separate terminals in VS Code. Keep all three running while using ScoreFlow.

### 1. Open the Project

Open VS Code and open the `Scoreflow` project folder.

Open the terminal:

`Terminal → New Terminal`

### 2. Run the Backend

Open the first terminal:

```powershell
cd C:\Scoreflow\server
npm install
npm run dev
```

The backend will start on port `5000` (if configured in your environment).

### 3. Run the Frontend

Open a second terminal using the `+` button in the terminal panel.

```powershell
cd C:\Scoreflow\client
npm install
npm run dev
```

Open the frontend URL displayed in the terminal, usually:

`http://localhost:5173`

### 4. Run the AI Service

Open a third terminal.

Go to the AI service folder:

```powershell
cd C:\Scoreflow\ai-service
```

Activate the Python virtual environment:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install dependencies (only required during initial setup or after dependency changes):

```powershell
pip install -r requirements.txt
```

Start the AI service:

```powershell
python -m uvicorn main:app --reload --port 8000
```

The AI service runs at:

`http://127.0.0.1:8000`

You can check whether it is running by opening:

`http://127.0.0.1:8000/health`

### 5. All Services Running

Keep all three terminals open:

| Service | Port |
|---|---:|
| Frontend | 5173 |
| Backend | 5000 |
| AI Service | 8000 |

**Remember:**
- Do not close the terminals while using the application.
- If you stop a service, restart it using its respective command.
- Press `Ctrl + C` to stop a running service.
- Never share or commit your `.env` files or API keys.

**Note:** Run `npm install` and `pip install` during initial setup or when dependencies change, not every time you start ScoreFlow.