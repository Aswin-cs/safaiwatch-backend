# SafaiWatch Backend API

SafaiWatch is an AI-powered community sanitation and cleanliness management platform. The backend provides robust RESTful APIs and real-time Socket.IO events for citizen spot reporting, liveness verification, AI-assisted cleanup validation, gamified rewards, dispute management, and community feeds.

---

## Tech Stack

- **Runtime & Framework**: [Node.js](https://nodejs.org/) (ES Modules) & [Express.js 5](https://expressjs.com/)
- **Database**: [MongoDB](https://www.mongodb.com/) via [Mongoose](https://mongoosejs.com/)
- **AI & Vision Verification**: [Google Gemini AI](https://ai.google.dev/) (`@google/genai`)
- **Real-Time Communication**: [Socket.IO](https://socket.io/)
- **Media Storage**: [Cloudinary](https://cloudinary.com/)
- **Authentication**: JWT (JSON Web Tokens), Google OAuth 2.0 (`googleapis`), OTP verification
- **Email Service**: [Nodemailer](https://nodemailer.com/) (Gmail SMTP)
- **Task Scheduling**: [node-cron](https://github.com/node-cron/node-cron)
- **Validation**: [Zod](https://zod.dev/) & [Multer](https://github.com/expressjs/multer)

---

## Project Architecture

```plaintext
backend/
├── config/                  # Configuration modules
│   ├── cloudinaryConfig.js  # Cloudinary SDK setup
│   ├── connectDb.js         # MongoDB connection handler
│   ├── envConfig.js         # Environment variables sanitizer & export
│   ├── geminiConfig.js      # Google Gemini client configuration
│   ├── oauth.js             # Google OAuth2 client initialization
│   └── socketIoConfig.js    # Socket.IO server & event handlers
├── models/                  # Mongoose data models
│   ├── feeds.model.js       # Community feed posts and interactions
│   ├── markedSpots.model.js # Reported spots, coordinates, and lifecycles
│   ├── one-time.model.js    # Ephemeral verification tokens & gestures
│   ├── report.model.js      # Dispute reports & counter-evidence
│   ├── user.model.js        # User accounts and roles
│   ├── userRewards.model.js # Rewards redemption and catalogue
│   └── userStatus.model.js  # Points, streaks, and user tiers
├── src/
│   ├── app.js               # Express app instance, middleware & cron jobs
│   ├── controllers/         # Request handling logic
│   │   ├── auth.controller.js
│   │   ├── feeds.controller.js
│   │   ├── profile.controller.js
│   │   ├── report.controller.js
│   │   ├── rewards.controller.js
│   │   └── spots.controller.js
│   ├── middlewares/         # Authorization, upload & location middlewares
│   │   ├── authorize.middleware.js
│   │   ├── location.middleware.js
│   │   └── upload.middleware.js
│   ├── routes/              # Express API route declarations
│   │   ├── auth.routes.js
│   │   ├── feeds.routes.js
│   │   ├── profile.routes.js
│   │   ├── rewards.routes.js
│   │   └── spots.routes.js
│   └── validators/          # Input schema validations
├── utils/                   # Helper functions & services
│   ├── aiPhotoVerification.utils.js # Gemini AI multimodal verification
│   ├── citizenClaims.utils.js       # AI analysis for reports & disputes
│   ├── Cloudinaryimage.utils.js     # Media upload utilities
│   ├── nodemailer.utils.js          # Email templates and delivery
│   ├── otpGenerator.utils.js        # Secure OTP generation
│   ├── responseHandler.js          # Standardized JSON response formatting
│   └── rewards.utils.js             # Points computation & reward logic
├── .env.example             # Template for environment variables
├── package.json             # Dependencies and project metadata
└── serverStart.js           # Server entry point & HTTP/Socket listener
```

---

## Environment Variables

Create a `.env` file in the root of the `backend` directory based on `.env.example`:

```bash
cp .env.example .env
```

Fill in the required configuration variables:

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `PORT` | HTTP Server port | `4000` |
| `NODE_ENV` | Environment mode (`development` or `production`) | `development` |
| `MONGO_URI` | MongoDB connection connection string | `mongodb://localhost:27017/safaiWatch` |
| `FRONTEND_URL` | Allowed client URL for CORS & redirects | `http://localhost:3000` |
| `JWT_SECRET` | Secret key for signing JSON Web Tokens | `your_jwt_secret` |
| `CLOUDINARY_NAME` | Cloudinary cloud name | `your_cloudinary_name` |
| `CLOUDINARY_API_KEY` | Cloudinary API key | `your_cloudinary_key` |
| `CLOUDINARY_API_SECRET`| Cloudinary API secret | `your_cloudinary_secret` |
| `GEMINI_API_KEY` | Google Gemini API key | `AIzaSy...` |
| `GEMINI_MODEL` | Gemini vision model identifier | `gemini-3.6-flash` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | `your_google_client_id` |
| `GOOGLE_CLIENT_SECRET`| Google OAuth Client Secret | `your_google_client_secret` |
| `GOOGLE_CALLBACK_URL` | Google OAuth redirect callback endpoint | `http://localhost:4000/api/v1/auth/google/callback` |
| `GMAIL_USER` | Gmail address for sending verification OTPs | `your_email@gmail.com` |
| `GMAIL_APP_PASSWORD` | 16-character Google App Password | `xxxx xxxx xxxx xxxx` |
| `EMAIL_FROM_NAME` | Display name for system transactional emails | `SafaiWatch` |

---

## Installation & Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.x or later recommended)
- [MongoDB](https://www.mongodb.com/) (running locally or via MongoDB Atlas)
- Accounts for Cloudinary, Google AI Studio (Gemini), and Google Cloud Console (OAuth)

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Run in Development Mode

Starts the server with `nodemon` watching for file changes (`.js`, `.json`, `.env`):

```bash
npm run dev
```

### 3. Run in Production Mode

```bash
npm start
```

The server will be available at `http://localhost:4000` (or your configured `PORT`).

---

## API Endpoints Reference

### Authentication (`/api/v1/auth`)

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/auth/` | Health check endpoint | Public |
| `POST` | `/api/v1/auth/sign-up` | Initiate registration & send OTP | Public |
| `POST` | `/api/v1/auth/verify/verify-otp-sign-up` | Verify signup OTP & create session | Public |
| `POST` | `/api/v1/auth/resend/resend-otp-sign-up` | Resend signup verification OTP | Public |
| `POST` | `/api/v1/auth/sign-up-completion` | Finalize profile details and avatar | Incomplete Session |
| `POST` | `/api/v1/auth/is-unique-username` | Validate username uniqueness | Public |
| `POST` | `/api/v1/auth/sign-in` | Initiate sign in & dispatch OTP | Public |
| `POST` | `/api/v1/auth/verify/verify-otp` | Verify login OTP & issue token | Public |
| `POST` | `/api/v1/auth/resend/resend-otp` | Resend login OTP | Public |
| `GET` | `/api/v1/auth/google` | Redirect to Google OAuth consent screen | Public |
| `GET` | `/api/v1/auth/google/callback` | Google OAuth redirect callback | Public |
| `GET` | `/api/v1/auth/me` | Fetch active user credentials and status | Authenticated |
| `POST` | `/api/v1/auth/sign-out` | Clear authentication session cookies | Authenticated |

---

### Spot Management (`/api/v1/spots`)

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/spots/gesture-verification` | Generate random dynamic gesture for liveness proof | Authenticated |
| `POST` | `/api/v1/spots/code-verification` | Generate one-time alphanumeric verification code | Authenticated |
| `GET` | `/api/v1/spots` | List all spots (supports query filters) | Public |
| `GET` | `/api/v1/spots/:id` | Get details of a single spot | Public |
| `POST` | `/api/v1/spots` | Report a new dirty spot (Image + Gemini AI validation) | Civilian, Hybrid |
| `PUT` | `/api/v1/spots/:id` | Update spot details | Authenticated |
| `DELETE`| `/api/v1/spots/:id` | Remove a spot | Authenticated |
| `DELETE`| `/api/v1/spots/:id/one-time` | Discard pending verification token | Authenticated |
| `PATCH`| `/api/v1/spots/:id/assign` | Assign spot to user/coordinator for cleanup | Authenticated |
| `PATCH`| `/api/v1/spots/:id/complete` | Complete cleanup (Image upload & AI validation) | Coordinator, Hybrid |
| `PATCH`| `/api/v1/spots/:id/rate` | Rate cleanup quality and submit feedback | Authenticated |
| `POST` | `/api/v1/spots/:id/report` | Report/contest fraudulent spot marking | Authenticated |
| `POST` | `/api/v1/spots/:id/report-cleanup` | Report disputed cleanup claims | Authenticated |
| `POST` | `/api/v1/spots/:id/counter-evidence`| Upload counter-evidence for contested spots | Authenticated |

---

### Profile & User Activity (`/api/v1/profile`)

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/profile/basic-info` | Get user basic stats and metadata | Authenticated |
| `GET` | `/api/v1/profile/get-my-profile` | Get full user profile and preferences | Authenticated |
| `GET` | `/api/v1/profile/history` | Get marked and cleaned spot history | Authenticated |
| `GET` | `/api/v1/profile/notifications` | Fetch user alerts and system notifications | Authenticated |
| `PATCH`| `/api/v1/profile/update` | Update profile information & avatar | Authenticated |
| `POST` | `/api/v1/profile/report-explanation` | Submit explanations for contested flags | Authenticated |
| `GET` | `/api/v1/profile/rewards-history` | List points and reward redemption logs | Authenticated |
| `POST` | `/api/v1/profile/redeem-reward` | Claim and redeem available perks | Authenticated |
| `GET` | `/api/v1/profile/:username` | View public profile by username | Public |

---

### Rewards & Gamification (`/api/v1/rewards`)

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/rewards/catalog` | View rewards catalog and coin costs | Public |
| `GET` | `/api/v1/rewards/leaderboard` | View global user rankings & top contributors | Public |
| `GET` | `/api/v1/rewards/` | Get current authenticated user's rewards | Authenticated |
| `GET` | `/api/v1/rewards/history` | View history of earned and redeemed rewards | Authenticated |
| `POST` | `/api/v1/rewards/redeem` | Redeem a specific reward item | Authenticated |

---

### Community Feed (`/api/v1/feeds`)

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/feeds` | Paginated list of completed cleanup stories | Optional Auth |
| `GET` | `/api/v1/feeds/:id` | View post details and clean-up before/after | Optional Auth |
| `POST` | `/api/v1/feeds/:id/like` | Like or unlike a community feed post | Optional Auth |

---

## Real-Time Features (Socket.IO)

The backend runs a Socket.IO server alongside Express on the same HTTP server port.

- **Real-Time Spot Updates**: Instant notifications emitted when spots are marked, assigned, or completed.
- **Activity Feed**: Live updates for community feed posts and upvotes.
- **Dispute & Contest Alerts**: Push notifications sent to spot creators and coordinators when disputes are submitted.

---

## Background Cron Jobs

Configured using `node-cron` in `src/app.js`:
- **Every 5 Minutes (`*/5 * * * *`)**:
  - Automatically purges abandoned spots that never passed verification within the grace period.
  - Deletes expired one-time verification tokens and gesture codes to prevent database bloat.

---

## Security & Best Practices

- **Role-Based Access Control (RBAC)**: Fine-grained permissions for `Civilian`, `Coordinator`, and `Hybrid` roles via `authorize.middleware.js`.
- **Anti-Spoofing & Liveness**: Verifies camera captures using unpredictable gestures and randomized codes analyzed by Google Gemini AI Vision.
- **Cookie Security**: HTTP-only cookies with same-site configurations for authentication tokens.
- **CORS Protection**: Restricted to authorized frontend origins and production deployments.
- **Input Sanitation**: Zod schemas and file mimetype checks to ensure safe payloads.
