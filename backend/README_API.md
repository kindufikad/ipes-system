# IEPS API

## Start the server

```bash
cd backend
npm start
```

## Endpoints

- GET /api/health
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me
- GET /api/course-assignments
- POST /api/course-assignments
- GET /api/evaluations
- POST /api/evaluations
- PUT /api/evaluations/:id

## Example Postman usage

1. Register a user:
   - POST http://localhost:5000/api/auth/register
   - JSON body:
     {
       "full_name": "Demo User",
       "email": "demo@example.com",
       "username": "demo",
       "password": "secret123",
       "role": "student"
     }

2. Login:
   - POST http://localhost:5000/api/auth/login
   - JSON body:
     {
       "username": "demo",
       "password": "secret123"
     }

3. Use the returned token in the Authorization header:
   - `Authorization: Bearer <token>`

4. Create an assignment:
   - POST http://localhost:5000/api/course-assignments
   - JSON body:
     {
       "course_code": "CS101",
       "course_name": "Intro to Computing",
       "instructor_id": 1,
       "student_id": 2,
       "assignment_title": "Midterm Review",
       "status": "assigned"
     }

5. Submit an evaluation:
   - POST http://localhost:5000/api/evaluations
   - JSON body:
     {
       "assignment_id": 1,
       "score": 4.5,
       "feedback": "Great work",
       "status": "submitted"
     }
