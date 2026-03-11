
with open('/home/flow-admin/aetherlabs-free-tool/src/app/pro/workspace/page.tsx', 'r') as f:
    content = f.read()

def count_tokens(c, open_char, close_char):
    balance = 0
    for i, char in enumerate(c):
        if char == open_char:
            balance += 1
        elif char == close_char:
            balance -= 1
        if balance < 0:
            print(f"Negative balance at index {i} ('{char}') around line {c[:i].count('\\n') + 1}")
    return balance

print("Braces {}:", count_tokens(content, '{', '}'))
print("Parentheses ():", count_tokens(content, '(', ')'))
print("Brackets []:", count_tokens(content, '[', ']'))
