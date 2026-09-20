CREATE DATABASE IF NOT EXISTS career_portal;
USE career_portal;

CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('APPLICANT','RECRUITER','ADMIN') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE companies (
    company_id INT AUTO_INCREMENT PRIMARY KEY,
    company_name VARCHAR(150) NOT NULL UNIQUE,
    industry VARCHAR(100),
    location VARCHAR(150)
);

CREATE TABLE applicants (
    applicant_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    university VARCHAR(150),
    degree VARCHAR(100),
    branch VARCHAR(100),
    gpa DECIMAL(4,2),
    experience_years DECIMAL(4,1) DEFAULT 0,
    resume_text LONGTEXT,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE recruiters (
    recruiter_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    company_id INT NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (company_id) REFERENCES companies(company_id)
);

CREATE TABLE positions (
    position_id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    min_gpa DECIMAL(4,2),
    min_experience_years DECIMAL(4,1) DEFAULT 0,
    status ENUM('OPEN','CLOSED') DEFAULT 'OPEN',
    FOREIGN KEY (company_id) REFERENCES companies(company_id)
);

CREATE TABLE skills (
    skill_id INT AUTO_INCREMENT PRIMARY KEY,
    skill_name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE applicant_skills (
    applicant_id INT NOT NULL,
    skill_id INT NOT NULL,
    proficiency ENUM('BEGINNER','INTERMEDIATE','ADVANCED','EXPERT') DEFAULT 'INTERMEDIATE',
    PRIMARY KEY (applicant_id, skill_id),
    FOREIGN KEY (applicant_id) REFERENCES applicants(applicant_id),
    FOREIGN KEY (skill_id) REFERENCES skills(skill_id)
);

CREATE TABLE position_requirements (
    position_id INT NOT NULL,
    skill_id INT NOT NULL,
    is_mandatory BOOLEAN DEFAULT TRUE,
    weight DECIMAL(5,2) DEFAULT 1.00,
    PRIMARY KEY (position_id, skill_id),
    FOREIGN KEY (position_id) REFERENCES positions(position_id),
    FOREIGN KEY (skill_id) REFERENCES skills(skill_id)
);

CREATE TABLE certifications (
    certification_id INT AUTO_INCREMENT PRIMARY KEY,
    applicant_id INT NOT NULL,
    certification_name VARCHAR(150) NOT NULL,
    issuing_organization VARCHAR(150),
    issue_date DATE,
    FOREIGN KEY (applicant_id) REFERENCES applicants(applicant_id)
);

CREATE TABLE applications (
    application_id INT AUTO_INCREMENT PRIMARY KEY,
    applicant_id INT NOT NULL,
    position_id INT NOT NULL,
    status ENUM('APPLIED','SHORTLISTED','SELECTED','REJECTED') DEFAULT 'APPLIED',
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_application (applicant_id, position_id),
    FOREIGN KEY (applicant_id) REFERENCES applicants(applicant_id),
    FOREIGN KEY (position_id) REFERENCES positions(position_id)
);

CREATE TABLE match_results (
    match_id INT AUTO_INCREMENT PRIMARY KEY,
    applicant_id INT NOT NULL,
    position_id INT NOT NULL,
    match_score DECIMAL(5,2) NOT NULL,
    eligible BOOLEAN NOT NULL,
    skill_gap TEXT,
    ai_summary TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (applicant_id) REFERENCES applicants(applicant_id),
    FOREIGN KEY (position_id) REFERENCES positions(position_id)
);

CREATE INDEX idx_positions_status ON positions(status);
CREATE INDEX idx_applicant_skills_skill ON applicant_skills(skill_id);
CREATE INDEX idx_position_requirements_skill ON position_requirements(skill_id);
CREATE INDEX idx_applications_status ON applications(status);

CREATE VIEW eligible_applications AS
SELECT
    a.application_id,
    a.applicant_id,
    a.position_id,
    a.status,
    ap.full_name,
    p.title
FROM applications a
JOIN applicants ap ON ap.applicant_id = a.applicant_id
JOIN positions p ON p.position_id = a.position_id
WHERE (p.min_gpa IS NULL OR ap.gpa >= p.min_gpa)
  AND ap.experience_years >= p.min_experience_years;
