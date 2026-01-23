from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from .db import models, database

models.Base.metadata.create_all(bind=database.engine)

app = FastAPI()

@app.get("/")
def read_root():
    return {"status": "Anti-Gravity Protocol Active"}

@app.post("/db-test/")
def create_test_item(name: str, description: str, db: Session = Depends(database.get_db)):
    db_item = models.TestItem(name=name, description=description)
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

@app.get("/db-test/")
def read_test_items(db: Session = Depends(database.get_db)):
    items = db.query(models.TestItem).all()
    return items
