from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment / .env file."""

    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/jobtracker"
    cors_origins: str = "http://localhost:5173"

    # LLM via Ollama. Default to the cloud model (fast, no local load; needs
    # `ollama signin`). For a fully-local/offline setup, set these to
    # qwen3:4b (fetch-JD + ATS) and qwen3:8b (compatibility).
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "gpt-oss:20b-cloud"
    ollama_compat_model: str = "gpt-oss:20b-cloud"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
