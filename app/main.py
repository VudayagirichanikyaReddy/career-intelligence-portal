from .routes.recruiter import router as recruiter_router
from .routes.applications import router as applications_router
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .routes.applicants import router as applicant_router
from .routes.jobs import router as jobs_router
from .routes.career import router as career_router
from .routes.auth import router as auth_router

app = FastAPI(title="Career Intelligence & Recruitment Portal")

templates = Jinja2Templates(directory="app/templates")

app.mount("/static", StaticFiles(directory="app/static"), name="static")

app.include_router(auth_router)
app.include_router(applications_router)
app.include_router(recruiter_router)
app.include_router(applicant_router)
app.include_router(jobs_router)
app.include_router(career_router)


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html"
    )
