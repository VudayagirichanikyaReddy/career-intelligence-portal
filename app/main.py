from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .routes.applicants import router as applicant_router
from .routes.jobs import router as jobs_router

app = FastAPI(title="Career Intelligence & Recruitment Portal")

templates = Jinja2Templates(directory="app/templates")

# NEW: serves app/static/css/style.css and app/static/js/app.js to the frontend.
# This is the only backend change made — everything else in main.py is untouched.
app.mount("/static", StaticFiles(directory="app/static"), name="static")

app.include_router(applicant_router)
app.include_router(jobs_router)


@app.get("/", response_class=HTMLResponse)
def home(request: Request):

    return templates.TemplateResponse(
        request=request,
        name="index.html"
    )
