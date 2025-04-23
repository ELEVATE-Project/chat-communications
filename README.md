<div align="center">

# Chat Communications Service

<a href="https://shikshalokam.org/elevate/">
<img
    src="https://shikshalokam.org/wp-content/uploads/2021/06/elevate-logo.png"
    height="140"
    width="300"
/>
</a>

[![CircleCI](https://dl.circleci.com/status-badge/img/gh/ELEVATE-Project/mentoring/tree/master.svg?style=shield)](https://dl.circleci.com/status-badge/redirect/gh/ELEVATE-Project/mentoring/tree/master)
[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=ELEVATE-Project_mentoring&metric=duplicated_lines_density&branch=master)](https://sonarcloud.io/summary/new_code?id=ELEVATE-Project_mentoring)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=ELEVATE-Project_mentoring&metric=coverage)](https://sonarcloud.io/summary/new_code?id=ELEVATE-Project_mentoring)
[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=ELEVATE-Project_mentoring&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=ELEVATE-Project_mentoring)
[![Prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://prettier.io)
[![Docs](https://img.shields.io/badge/Docs-success-informational)](https://elevate-docs.shikshalokam.org/mentorEd/intro)

</div>

---

## Overview

The **Chat Communications Service** is an internal microservice designed to act as middleware between the core application services and chat platforms like [Rocket.Chat](https://rocket.chat/). It simplifies the integration, management, and scalability of chat-based communications for various use cases.

### Key Features

-   Acts as a middleware for seamless communication with chat platforms.
-   Provides abstraction for APIs of chat services.
-   Offers extensible architecture to integrate additional chat providers in the future.
-   Ensures robust logging and error handling for chat-related operations.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Features](#features)
3. [Installation](#installation)
4. [License](#license)

---

## Getting Started

### Prerequisites

-   **Node.js** (v16.x or later)
-   **PostgreSQL** for any required database operations.
-   Access to a configured [Rocket.Chat](https://rocket.chat/) server.

### Installation

1. Clone the repository:

    ```
    git clone https://github.com/ELEVATE-Project/chat-communications.git
    cd chat-communications
    ```

2. Install dependencies:

    ```
    npm install
    ```

3. Set up environment variables:
   Create a `.env` file with the following configurations:

    ```
    CHAT_PLATFORM_URL=<your_chat_platform_url>
    CHAT_PLATFORM_ADMIN_EMAIL=<your_chat_platform_admin_email>
    CHAT_PLATFORM_ADMIN_USER_ID=<your_chat_platform_admin_user_id>
    CHAT_PLATFORM_ACCESS_TOKEN=<your_chat_platform_admin_token>
    INTERNAL_ACCESS_TOKEN=<your_internal_access_token>
    DEV_DATABASE_URL=<your_development_database_url>
    USERNAME_HASH_SALT=<your_username_hash_salt>
    PASSWORD_HASH_SALT=<your_password_hash_salt>

    ```

4. Run migrations:

    ```
    npx sequelize-cli db:migrate
    ```

5. Start the service:
    ```
    npm start
    ```

---

## Features

-   **Chat Integration:** Unified interface to interact with chat platforms.
-   **User Management:** Create, delete, and manage chat users programmatically.
-   **Room Management:** Automate chat room creation and management.
-   **Message Handling:** Send and receive messages with structured APIs.
-   **Extensibility:** Easily add support for new chat providers.

---

## License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT). See the [LICENSE](LICENSE) file for details.

---
