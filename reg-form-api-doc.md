# Student Registration Form API

This document describes the public API used by the `/student-reg-form` page.

## Endpoint

- **Primary route:** `POST /api/student-reg-form`
- **Alias route (same behavior):** `POST /api/student-registration`
- **Auth:** Not required (public endpoint)
- **Content-Type:** `application/json`

Both routes run the exact same validation and storage logic.

## Purpose

Submit student inquiry/interest form data and append it to `backend/data/req-students.json`.

## Request Body

All fields are sent as JSON.

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+94771234567",
  "countryToVisit": "UK",
  "city": "Colombo",
  "nearestOffice": "Colombo",
  "currentEducationLevel": "Bachelor's degree",
  "intendedProgram": "MSc Data Science",
  "message": "I want to apply for the September intake."
}
```

## Field Rules

- `name` (required): non-empty string.
- `email` (required): valid email format.
- `phone` (required): non-empty string (`contactNumber` is also accepted as fallback key).
- `countryToVisit` (required): must match an existing value from `/api/countries` (case-insensitive match).
- `nearestOffice` (required when branches exist): must match an existing branch location from `/api/branches` (case-insensitive match).
- `currentEducationLevel` (optional): string, stored as `null` when empty.
- `intendedProgram` (optional): string, stored as `null` when empty.
- `city` (optional): string, stored as `null` when empty.
- `message` (optional): string, stored as `null` when empty.

## Success Response

- **Status:** `201 Created`
- **Body:**

```json
{
  "ok": true,
  "data": {
    "id": "REQ-1715158123456-a1b2c3d4",
    "submittedAt": "2026-05-08T06:50:00.000Z"
  }
}
```

## Error Responses

- **400 Bad Request** (validation failures)
  - `Name, email, contact number, and country to visit are required.`
  - `Please enter a valid email address.`
  - `Please choose a valid country to visit from the list.`
  - `Please choose your nearest office from the list.`
  - `Please choose a valid nearest office from the list.`
  - `Invalid request body.` (invalid JSON)
- **500 Internal Server Error**
  - `Could not save your registration. Please try again later.`

## Stored Record Shape

Each accepted submission is appended with this structure:

```json
{
  "id": "REQ-...",
  "submittedAt": "2026-05-08T06:50:00.000Z",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+94771234567",
  "countryToVisit": "UK",
  "city": "Colombo",
  "nearestOffice": "Colombo",
  "currentEducationLevel": "Bachelor's degree",
  "intendedProgram": "MSc Data Science",
  "message": "I want to apply for the September intake.",
  "source": "student-reg-form"
}
```

## cURL Example

```bash
curl -X POST "http://localhost:3334/api/student-reg-form" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Jane Doe",
    "email":"jane@example.com",
    "phone":"+94771234567",
    "countryToVisit":"UK",
    "city":"Colombo",
    "nearestOffice":"Colombo",
    "currentEducationLevel":"Bachelor'\''s degree",
    "intendedProgram":"MSc Data Science",
    "message":"I want to apply for the September intake."
  }'
```
