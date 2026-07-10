const fs = require('fs');
const path = './src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

// Replace standard fetch with authorized fetch
content = content.replace(/await fetch\(`/g, 'await fetchWithAuth(`');

// Change export and add Router
content = content.replace("const App = () => {", "const Dashboard = () => {");
content = content.replace("export default App;", `
const AppRouter = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
      </Routes>
    </BrowserRouter>
  );
};
export default AppRouter;
`);

// Add imports at the top
const imports = `import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import LoginPage from './components/LoginPage';

// Custom fetch wrapper
const fetchWithAuth = async (url, options = {}) => {
  const token = localStorage.getItem('smarthome_token');
  const headers = {
    ...options.headers,
    ...(token ? { 'Authorization': \`Bearer \${token}\` } : {})
  };
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    localStorage.removeItem('smarthome_token');
    window.location.href = '/login';
  }
  return response;
};

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('smarthome_token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
};
`;
content = content.replace("import React, { useState, useEffect, useRef } from 'react';", "import React, { useState, useEffect, useRef } from 'react';\n" + imports);

fs.writeFileSync(path, content, 'utf8');
console.log('App.jsx updated');
