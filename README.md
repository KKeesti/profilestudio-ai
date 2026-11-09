<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/cc0e9c24-ae46-4308-b205-a65e3d2347b4

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. To enable paid photo animation, add `GEMINI_VIDEO_MODEL=gemini-omni-1.1-flash` after confirming that the Google project has Paid Tier access. The interface stays hidden until this variable is present.
4. To grant a verified owner account unrestricted in-app usage without reducing its credit balance, add `OWNER_EMAILS=owner@example.com` to `server/.env`. Keep this setting server-side and use a comma-separated list only when multiple owners are required.
5. Run the app:
   `npm run dev`
