#!/usr/bin/env python3
import json
import os
import sys
import traceback


def emit(event):
    sys.stdout.write(json.dumps(event, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    try:
        request = json.loads(sys.stdin.read() or "{}")
    except Exception as exc:
        emit({"event": "error", "retryable": False, "message": f"invalid_request_json:{exc}"})
        return 2

    if os.environ.get("SKS_PYTHON_CODEX_SDK_FAKE") == "1":
        emit({"event": "thread_started", "thread_id": "py-fixture-thread"})
        emit({"event": "turn_started", "turn_id": "py-fixture-turn"})
        emit({"event": "notification", "turn_id": "py-fixture-turn", "type": "tool_call_started"})
        emit({"event": "turn_completed", "turn_id": "py-fixture-turn", "status": "completed", "final_response": json.dumps({
            "status": "done",
            "summary": "Python Codex SDK fixture completed.",
            "findings": [],
            "changed_files": [],
            "patch_envelopes": [],
            "verification": {"status": "passed", "checks": ["python-codex-sdk-fixture"]},
            "rollback_notes": [],
            "blockers": []
        })})
        return 0

    import_errors = []

    try:
        from codex_app_server import Codex as AppServerCodex  # type: ignore
        return run_codex_app_server_sdk(AppServerCodex, request)
    except ImportError as exc:
        import_errors.append(f"codex_app_server:{exc}")
    except Exception as exc:
        emit({"event": "error", "retryable": True, "message": str(exc), "trace": traceback.format_exc(limit=3)})
        return 4

    try:
        from openai_codex import Codex, Sandbox  # type: ignore
        return run_openai_codex_sdk(Codex, Sandbox, request)
    except ImportError as exc:
        import_errors.append(f"openai_codex:{exc}")
    except Exception as exc:
        emit({"event": "error", "retryable": True, "message": str(exc), "trace": traceback.format_exc(limit=3)})
        return 4

    try:
        from openai_codex_sdk import Codex as PyPiCodex  # type: ignore
        return run_openai_codex_sdk_wrapper(PyPiCodex, request)
    except ImportError as exc:
        import_errors.append(f"openai_codex_sdk:{exc}")
    except Exception as exc:
        emit({"event": "error", "retryable": True, "message": str(exc), "trace": traceback.format_exc(limit=3)})
        return 4

    emit({"event": "error", "retryable": False, "message": f"python_codex_sdk_unavailable:{'; '.join(import_errors)}"})
    return 3


def run_codex_app_server_sdk(codex_cls, request):
    sandbox = map_app_server_sandbox(request.get("sandbox"))
    prompt = str(request.get("prompt") or "")
    cwd = str(request.get("cwd") or os.getcwd())
    model = str(request.get("model") or "")
    output_schema = request.get("output_schema") or None
    with codex_cls() as codex:
        kwargs = {
            "cwd": cwd,
            "approval_policy": "never",
            "sandbox": sandbox,
        }
        if model:
            kwargs["model"] = model
        try:
            thread = codex.thread_start(**kwargs)
        except TypeError:
            thread = codex.thread_start()
        emit({"event": "thread_started", "thread_id": getattr(thread, "id", None) or "", "sdk_import": "codex_app_server"})
        emit({"event": "turn_started", "turn_id": "turn-1", "sdk_import": "codex_app_server"})
        try:
            result = thread.run(prompt, output_schema=output_schema) if output_schema else thread.run(prompt)
        except TypeError:
            result = thread.run(prompt)
        emit({
            "event": "turn_completed",
            "turn_id": getattr(result, "turn_id", None) or "turn-1",
            "status": "completed",
            "final_response": getattr(result, "final_response", "") or "",
            "sdk_import": "codex_app_server",
        })
    return 0


def run_openai_codex_sdk(Codex, Sandbox, request):
    sandbox_map = {
        "read_only": Sandbox.read_only,
        "workspace_write": Sandbox.workspace_write,
        "full_access": Sandbox.full_access,
    }
    sandbox = sandbox_map.get(str(request.get("sandbox") or "read_only"), Sandbox.read_only)
    prompt = str(request.get("prompt") or "")
    model = str(request.get("model") or "")
    try:
        with Codex() as codex:
            try:
                thread = codex.thread_start(sandbox=sandbox, model=model) if model else codex.thread_start(sandbox=sandbox)
            except TypeError:
                thread = codex.thread_start(sandbox=sandbox)
            emit({"event": "thread_started", "thread_id": getattr(thread, "id", None) or "", "sdk_import": "openai_codex"})
            emit({"event": "turn_started", "turn_id": "turn-1", "sdk_import": "openai_codex"})
            result = thread.run(prompt)
            emit({
                "event": "turn_completed",
                "turn_id": getattr(result, "turn_id", None) or "turn-1",
                "status": "completed",
                "final_response": getattr(result, "final_response", "") or "",
                "sdk_import": "openai_codex",
            })
        return 0
    except Exception as exc:
        emit({"event": "error", "retryable": True, "message": str(exc), "trace": traceback.format_exc(limit=3)})
        return 4


def run_openai_codex_sdk_wrapper(codex_cls, request):
    import asyncio

    async def run():
        prompt = str(request.get("prompt") or "")
        output_schema = request.get("output_schema") or None
        codex_options = {}
        codex_bin = os.environ.get("SKS_PYTHON_CODEX_SDK_CODEX_BIN")
        if codex_bin:
            codex_options["codex_path_override"] = codex_bin
        model = str(request.get("model") or "")
        lb_base_url = normalize_codex_lb_base_url(os.environ.get("CODEX_LB_BASE_URL"))
        if lb_base_url and os.environ.get("CODEX_LB_API_KEY"):
            pass
        else:
            base_url = os.environ.get("OPENAI_BASE_URL")
            api_key = os.environ.get("CODEX_API_KEY") or os.environ.get("OPENAI_API_KEY")
            if base_url:
                codex_options["base_url"] = base_url
            if api_key:
                codex_options["api_key"] = api_key
        codex = codex_cls(codex_options)
        thread_options = {
            "working_directory": str(request.get("cwd") or os.getcwd()),
            "skip_git_repo_check": True,
            "sandbox_mode": map_cli_sandbox(request.get("sandbox")),
            "approval_policy": "never",
            "model_reasoning_effort": str(request.get("model_reasoning_effort") or "minimal"),
            "network_access_enabled": str(request.get("sandbox") or "read_only") != "read_only",
        }
        if model:
            thread_options["model"] = model
        thread = codex.start_thread(thread_options)
        streamed = await thread.run_streamed(prompt, {"output_schema": output_schema} if output_schema else None)
        final_response = ""
        turn_id = "turn-1"
        thread_started = False
        turn_started = False
        async for event in streamed.events:
            event_type = getattr(event, "type", "unknown")
            if event_type == "thread.started":
                thread_id = getattr(event, "thread_id", None) or getattr(thread, "id", None) or ""
                emit({"event": "thread_started", "thread_id": thread_id, "sdk_import": "openai_codex_sdk"})
                thread_started = True
            elif event_type == "turn.started":
                emit({"event": "turn_started", "turn_id": turn_id, "sdk_import": "openai_codex_sdk"})
                turn_started = True
            elif event_type == "item.completed":
                item = getattr(event, "item", None)
                item_type = getattr(item, "type", None) if item is not None else None
                if item_type == "agent_message":
                    final_response = getattr(item, "text", "") or ""
                emit({
                    "event": "notification",
                    "turn_id": turn_id,
                    "type": "item.completed",
                    "item_type": item_type,
                    "sdk_import": "openai_codex_sdk",
                })
            elif event_type == "turn.failed":
                error = getattr(event, "error", None)
                message = getattr(error, "message", None) if error is not None else "turn_failed"
                emit({"event": "error", "retryable": True, "message": message, "sdk_import": "openai_codex_sdk"})
                return 4
            elif event_type == "turn.completed":
                if not thread_started:
                    emit({"event": "thread_started", "thread_id": getattr(thread, "id", None) or "", "sdk_import": "openai_codex_sdk"})
                    thread_started = True
                if not turn_started:
                    emit({"event": "turn_started", "turn_id": turn_id, "sdk_import": "openai_codex_sdk"})
                    turn_started = True
                emit({
                    "event": "turn_completed",
                    "turn_id": turn_id,
                    "status": "completed",
                    "final_response": final_response,
                    "sdk_import": "openai_codex_sdk",
                })
            else:
                emit({"event": "notification", "turn_id": turn_id, "type": event_type, "sdk_import": "openai_codex_sdk"})
        return 0

    return asyncio.run(run())


def map_cli_sandbox(value):
    if value == "workspace_write":
        return "workspace-write"
    if value == "full_access":
        return "danger-full-access"
    return "read-only"


def map_app_server_sandbox(value):
    if value == "workspace_write":
        return "workspaceWrite"
    if value == "full_access":
        return "dangerFullAccess"
    return "readOnly"


def normalize_codex_lb_base_url(value):
    host = str(value or "").strip().rstrip("/")
    if not host:
        return ""
    if "://" not in host:
        host = f"https://{host}"
    if host.lower().endswith("/backend-api/codex"):
        return host
    return f"{host}/backend-api/codex"


if __name__ == "__main__":
    raise SystemExit(main())
