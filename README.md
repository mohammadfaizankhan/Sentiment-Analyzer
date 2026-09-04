# SignalSense - Call Sentiment Intelligence

Netlify-ready full-stack conversation sentiment analyzer built for the supplied assignment.

## Features

- Register and sign in with accounts stored in Netlify Blobs
- Upload or paste `.txt` call transcripts
- Explainable overall and sentence-level sentiment
- Emotion mix, trend chart, executive summary, and key moments
- Operational KPIs: satisfaction, resolution, churn, escalation, empathy, speaker sentiment, talk share, questions, and topics
- Responsive React dashboard with Netlify Functions backend

## Local development

```bash
npm install
npx netlify dev
```

Set a 32+ character `AUTH_SECRET` in Netlify environment variables before deployment.

## Production

```bash
npm run build
npx netlify deploy --prod
```
