from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from .routes.applicants import router as applicant_router
from .routes.career import router as career_router

app = FastAPI(title="Career Intelligence & Recruitment Portal")

templates = Jinja2Templates(directory="app/templates")

app.include_router(applicant_router)
app.include_router(career_router)


@app.get("/", response_class=HTMLResponse)
def home(request: Request):

    return templates.TemplateResponse(
        request=request,
        name="index.html"
    )
