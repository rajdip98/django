"""Devin, a local-first desktop assistant for Windows.

This is intentionally a consent-first assistant: it can open applications and
search the web, but it never executes shell commands supplied in a prompt.
Every desktop action is shown in the activity feed before it is performed.
"""

from __future__ import annotations

import concurrent.futures
import importlib.util
import os
import platform
import queue
import shutil
import subprocess
import threading
import urllib.parse
import webbrowser
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable

import tkinter as tk
from tkinter import scrolledtext, ttk


@dataclass(frozen=True)
class Action:
    """A planned, user-visible desktop action."""

    title: str
    detail: str
    run: Callable[[], str]


class DevinApp(tk.Tk):
    """Small, dependency-free graphical shell for the Devin assistant."""

    def __init__(self) -> None:
        super().__init__()
        self.title("Devin — Personal Desktop Assistant")
        self.geometry("1060x720")
        self.minsize(840, 580)
        self.configure(bg="#070b16")
        self.events: queue.Queue[tuple[str, str]] = queue.Queue()
        self.listening = False
        self._build_ui()
        self.after(100, self._drain_events)
        self.after(500, lambda: self._assistant_message("Hello, I am Devin. What can I help you accomplish?"))

    def _build_ui(self) -> None:
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("TFrame", background="#070b16")
        style.configure("TLabel", background="#070b16", foreground="#eaf1ff")
        style.configure("TButton", background="#287dff", foreground="white", borderwidth=0, padding=10)
        style.map("TButton", background=[("active", "#4795ff")])

        top = ttk.Frame(self, padding=(28, 22))
        top.pack(fill="x")
        ttk.Label(top, text="DEVIN", font=("Segoe UI", 22, "bold"), foreground="#65b7ff").pack(side="left")
        ttk.Label(top, text="  LOCAL DESKTOP ASSISTANT", font=("Segoe UI", 10, "bold"), foreground="#93a7c8").pack(side="left")
        self.status = ttk.Label(top, text="● READY", foreground="#58e3b0", font=("Segoe UI", 10, "bold"))
        self.status.pack(side="right")

        main = ttk.Frame(self, padding=(28, 0, 28, 24))
        main.pack(fill="both", expand=True)
        main.columnconfigure(1, weight=1)
        main.rowconfigure(0, weight=1)

        left = ttk.Frame(main, padding=(0, 8, 26, 0))
        left.grid(row=0, column=0, sticky="ns")
        self.orb = tk.Canvas(left, width=280, height=280, bg="#070b16", highlightthickness=0)
        self.orb.pack()
        self._draw_orb()
        ttk.Label(left, text="Your command center", font=("Segoe UI", 13, "bold")).pack(pady=(18, 5))
        ttk.Label(left, text="Text, voice, research, coding\nand desktop shortcuts.", justify="center", foreground="#9cafca").pack()
        self.voice_button = ttk.Button(left, text="🎙  Start voice input", command=self._toggle_voice)
        self.voice_button.pack(fill="x", pady=(20, 8))
        ttk.Label(left, text="Voice input is optional and stays off\nuntil you start it.", justify="center", foreground="#6f83a4", font=("Segoe UI", 9)).pack()

        right = ttk.Frame(main)
        right.grid(row=0, column=1, sticky="nsew")
        right.rowconfigure(0, weight=1)
        right.columnconfigure(0, weight=1)
        self.transcript = scrolledtext.ScrolledText(
            right, wrap="word", state="disabled", bg="#0d1425", fg="#eaf1ff",
            insertbackground="#eaf1ff", relief="flat", padx=18, pady=18,
            font=("Segoe UI", 11),
        )
        self.transcript.grid(row=0, column=0, sticky="nsew")
        chips = ttk.Frame(right, padding=(0, 12, 0, 8))
        chips.grid(row=1, column=0, sticky="ew")
        for label, prompt in (
            ("Search the web", "search for desktop accessibility tips"),
            ("Open Documents", "open documents"),
            ("Plan a task", "plan: prepare a presentation about renewable energy"),
        ):
            ttk.Button(chips, text=label, command=lambda p=prompt: self._submit(p)).pack(side="left", padx=(0, 8))
        input_row = ttk.Frame(right)
        input_row.grid(row=2, column=0, sticky="ew")
        input_row.columnconfigure(0, weight=1)
        self.prompt = ttk.Entry(input_row, font=("Segoe UI", 11))
        self.prompt.grid(row=0, column=0, sticky="ew", padx=(0, 10), ipady=8)
        self.prompt.bind("<Return>", lambda _event: self._submit())
        ttk.Button(input_row, text="Send  ➜", command=self._submit).grid(row=0, column=1)
        self.prompt.focus_set()

    def _draw_orb(self) -> None:
        # Layered circles create a light-weight 3D, space-like assistant orb.
        for radius, color in ((126, "#102e61"), (112, "#174a91"), (96, "#2477dc"), (78, "#42a5ff")):
            self.orb.create_oval(140-radius, 140-radius, 140+radius, 140+radius, fill=color, outline="")
        self.orb.create_oval(92, 76, 150, 134, fill="#c4f1ff", outline="")
        self.orb.create_arc(35, 55, 245, 225, start=205, extent=130, style="arc", outline="#8ad4ff", width=2)
        self.orb.create_text(140, 170, text="DEVIN", fill="#ffffff", font=("Segoe UI", 19, "bold"))

    def _write(self, speaker: str, message: str) -> None:
        stamp = datetime.now().strftime("%H:%M")
        self.transcript.configure(state="normal")
        self.transcript.insert("end", f"{speaker.upper()}  {stamp}\n", (speaker,))
        self.transcript.insert("end", f"{message}\n\n")
        self.transcript.tag_config("you", foreground="#7dbbff", font=("Segoe UI", 9, "bold"))
        self.transcript.tag_config("devin", foreground="#64e6ba", font=("Segoe UI", 9, "bold"))
        self.transcript.configure(state="disabled")
        self.transcript.see("end")

    def _assistant_message(self, message: str) -> None:
        self._write("Devin", message)

    def _submit(self, command: str | None = None) -> None:
        text = (command if command is not None else self.prompt.get()).strip()
        if not text:
            return
        self.prompt.delete(0, "end")
        self._write("You", text)
        actions, response = self._plan(text)
        self._assistant_message(response)
        if actions:
            self._assistant_message("Planned actions:\n" + "\n".join(f"• {a.title} — {a.detail}" for a in actions))
            threading.Thread(target=self._run_actions, args=(actions,), daemon=True).start()

    def _plan(self, command: str) -> tuple[list[Action], str]:
        text = command.casefold()
        actions: list[Action] = []
        if text.startswith("search") or "search for" in text or "look up" in text:
            query = command.replace("search for", "").replace("search", "").replace("look up", "").strip(" :")
            actions.append(Action("Web search", query or "general search", lambda q=query: self._search(q)))
        if "open documents" in text or "open my documents" in text:
            actions.append(Action("Open Documents", "Open your Documents folder", lambda: self._open_path(Path.home() / "Documents")))
        if "open downloads" in text:
            actions.append(Action("Open Downloads", "Open your Downloads folder", lambda: self._open_path(Path.home() / "Downloads")))
        if "open browser" in text:
            actions.append(Action("Open browser", "Open the default browser", lambda: self._open_url("https://www.google.com")))
        if text.startswith("plan:") or "plan a task" in text:
            topic = command.split(":", 1)[-1].strip()
            return [], f"Here is a focused plan for {topic or 'your task'}:\n1. Define the desired result.\n2. Gather trusted sources and constraints.\n3. Draft the first version.\n4. Review, refine, and deliver.\n\nTell me which step to expand or ask me to search for sources."
        if actions:
            return actions, "I will carry out the requested, visible desktop actions now. Independent actions run in parallel."
        return [], ("I can help with research, planning, coding guidance, and approved desktop shortcuts. "
                    "Try ‘search for Python packaging’, ‘open documents’, or ‘plan: create a presentation’. "
                    "For safety, I do not run arbitrary commands or access private apps without a specific visible action.")

    def _run_actions(self, actions: list[Action]) -> None:
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(3, len(actions))) as pool:
            futures = {pool.submit(action.run): action for action in actions}
            for future in concurrent.futures.as_completed(futures):
                action = futures[future]
                try:
                    result = future.result()
                    self.events.put(("Devin", f"Completed: {action.title}. {result}"))
                except OSError as error:
                    self.events.put(("Devin", f"Could not complete {action.title}: {error}"))

    def _drain_events(self) -> None:
        while not self.events.empty():
            speaker, message = self.events.get_nowait()
            self._write(speaker, message)
        self.after(100, self._drain_events)

    @staticmethod
    def _open_url(url: str) -> str:
        webbrowser.open_new_tab(url)
        return "Opened in your default browser."

    def _search(self, query: str) -> str:
        return self._open_url("https://www.google.com/search?q=" + urllib.parse.quote_plus(query))

    @staticmethod
    def _open_path(path: Path) -> str:
        path.mkdir(parents=True, exist_ok=True)
        if platform.system() == "Windows":
            os.startfile(path)  # type: ignore[attr-defined]  # Windows-only API.
        elif shutil.which("xdg-open"):
            subprocess.Popen(["xdg-open", str(path)])
        else:
            webbrowser.open(path.as_uri())
        return f"Opened {path}."

    def _toggle_voice(self) -> None:
        self.listening = not self.listening
        if self.listening:
            self.status.configure(text="● VOICE READY", foreground="#ffc857")
            self.voice_button.configure(text="🎙  Stop voice input")
            if importlib.util.find_spec("speech_recognition") is None:
                self.listening = False
                self.status.configure(text="● READY", foreground="#58e3b0")
                self.voice_button.configure(text="🎙  Start voice input")
                self._assistant_message("Voice input needs the optional packages. Run `py -m pip install SpeechRecognition PyAudio`, then try again.")
                return
            self._assistant_message("Listening for one command. Speak after the tone of your microphone becomes available.")
            threading.Thread(target=self._capture_voice, daemon=True).start()
        else:
            self.status.configure(text="● READY", foreground="#58e3b0")
            self.voice_button.configure(text="🎙  Start voice input")

    def _capture_voice(self) -> None:
        """Capture one spoken command without ever blocking the Tk event loop."""
        import speech_recognition as sr

        recognizer = sr.Recognizer()
        try:
            with sr.Microphone() as source:
                recognizer.adjust_for_ambient_noise(source, duration=0.5)
                audio = recognizer.listen(source, timeout=8, phrase_time_limit=20)
            command = recognizer.recognize_google(audio)
            self.events.put(("Devin", f"Voice command heard: {command}"))
            self.after(0, lambda: self._submit(command))
        except (sr.WaitTimeoutError, sr.UnknownValueError):
            self.events.put(("Devin", "I did not catch that. Please try voice input again or type your command."))
        except sr.RequestError:
            self.events.put(("Devin", "Speech recognition service is unavailable. Check your internet connection or type your command."))
        except OSError as error:
            self.events.put(("Devin", f"Microphone is not available: {error}"))
        finally:
            self.listening = False
            self.after(0, lambda: (self.status.configure(text="● READY", foreground="#58e3b0"), self.voice_button.configure(text="🎙  Start voice input")))


if __name__ == "__main__":
    DevinApp().mainloop()
