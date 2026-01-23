# Research Paper Review RPA

This project is a Research Paper Review system using a PDF ingestion backend and a Next.js frontend.

## Prerequisites

*   [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

## Quick Start (For Collaborators)

If you have just cloned this repository:

1.  **Start the Application**:
    Run the following command in the root directory:
    ```bash
    docker-compose up --build
    ```
    *   **Frontend**: Opens at [http://localhost:3000](http://localhost:3000)
    *   **Backend API**: Opens at [http://localhost:8000](http://localhost:8000)
    *   **Database**: Postgres runs on port `5432`

2.  **Stop the Application**:
    Press `Ctrl+C` in the terminal, or run:
    ```bash
    docker-compose down
    ```

## Development

*   **Frontend**: Located in `/frontend`. Built with Next.js 14.
*   **Backend**: Located in `/backend`. Built with FastAPI and Python 3.11.
