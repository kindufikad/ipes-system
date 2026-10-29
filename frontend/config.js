// Environment configuration
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5005/api';
export const APP_NAME = 'Instructor Performance Evaluation System';
export const UNIVERSITY_NAME = 'Mekdela Amba University';

export const EVALUATION_CONFIG = {
  maxRating: 5,
  minRating: 1,
  categories: [
    'Teaching Methodology',
    'Subject Knowledge',
    'Communication Skills',
    'Student Engagement',
    'Assessment & Feedback'
  ]
};

export const ROUTES = {
  home: '/',
  about: '/about',
  contact: '/contact',
  login: '/login',
  studentDashboard: '/student-dashboard',
  adminDashboard: '/admin-dashboard',
};