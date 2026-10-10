#!/usr/bin/env python3
"""Static syntax check of the Unreal port without an engine install.

Compiles every .cpp in Source/Lanternbound with clang in -fsyntax-only mode
against ue_mock.h (a small stand-in for the engine API). UHT's
GENERATED_BODY() is replaced by the `Super` typedef and `StaticClass()` it
would provide. This catches typos and inconsistencies inside the port; it does
not prove the code compiles against the real Unreal Engine.

Usage: python3 unreal/tools/syntaxcheck/check.py
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, '..', '..', 'Lanternbound', 'Source', 'Lanternbound'))


def transform(text: str) -> str:
    out = []
    pending_base = None
    for line in text.split('\n'):
        m = re.match(r'\s*(?:class|struct)\s+(?:LANTERNBOUND_API\s+)?(\w+)\s*:\s*public\s+(\w+)', line)
        if m:
            pending_base = m.group(2)
        if 'GENERATED_BODY()' in line:
            if pending_base:
                line = line.replace('GENERATED_BODY()', f'public: typedef {pending_base} Super; static UClass* StaticClass() {{ return nullptr; }} private:')
            else:
                line = line.replace('GENERATED_BODY()', '')
            pending_base = None
        out.append(line)
    return '\n'.join(out)


def main() -> int:
    tmp = tempfile.mkdtemp(prefix='lb_syntax_')
    try:
        src = os.path.join(tmp, 'src')
        stubs = os.path.join(tmp, 'stubs')
        os.makedirs(src)
        os.makedirs(stubs)
        includes = set()
        for name in os.listdir(SRC):
            if not name.endswith(('.h', '.cpp')):
                continue
            with open(os.path.join(SRC, name), encoding='utf-8') as f:
                text = f.read()
            includes.update(re.findall(r'#include\s+"([^"]+)"', text))
            with open(os.path.join(src, name), 'w', encoding='utf-8') as f:
                f.write(transform(text))
        local = set(os.listdir(SRC))
        for inc in includes:
            if inc in local:
                continue
            path = os.path.join(stubs, inc)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'w') as f:
                f.write('#pragma once\n')
        cpps = sorted(n for n in os.listdir(src) if n.endswith('.cpp'))
        failed = 0
        for cpp in cpps:
            cmd = ['clang++', '-std=c++20', '-fsyntax-only', '-Wall', '-Wno-unused-variable', '-Wno-unused-private-field', '-Wno-unused-lambda-capture', '-Wno-unused-function',
                   '-include', os.path.join(HERE, 'ue_mock.h'), '-I', src, '-I', stubs, os.path.join(src, cpp)]
            r = subprocess.run(cmd, capture_output=True, text=True)
            status = 'ok' if r.returncode == 0 else 'FAILED'
            print(f'{status:6} {cpp}')
            if r.returncode != 0:
                failed += 1
                print(r.stderr)
            elif r.stderr.strip():
                print(r.stderr)
        print(f'\n{len(cpps) - failed}/{len(cpps)} files passed the syntax check')
        return 1 if failed else 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
