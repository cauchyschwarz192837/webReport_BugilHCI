def critical(n:int, edges:list[(int, int)]):
    if n <= 0:
        return []

    g = [[] for _ in range(n + 1)]
    for a, b in edges:
        if a != b:
            g[a].append(b)
            g[b].append(a)

    disc = [-1] * (n + 1)
    low = [0] * (n + 1)
    parent = [-1] * (n + 1)
    is_cut = [False] * (n + 1)
    root_children = [0] * (n + 1)
    time = 0

    for root in range(1, n + 1):
        if disc[root] != -1:
            continue

        stack = [(root, 0, True)]
        parent[root] = -1

        while stack:
            v, idx, entering = stack.pop()

            if entering:
                disc[v] = low[v] = time
                time += 1
                stack.append((v, 0, False))
                continue

            if idx < len(g[v]):
                u = g[v][idx]
                stack.append((v, idx + 1, False))

                if disc[u] == -1:
                    parent[u] = v
                    if v == root:
                        root_children[root] += 1
                    stack.append((u, 0, True))
                elif u != parent[v]:
                    if disc[u] < low[v]:
                        low[v] = disc[u]
            else:
                p = parent[v]
                if p != -1:
                    if low[v] < low[p]:
                        low[p] = low[v]
                    if p != root and low[v] >= disc[p]:
                        is_cut[p] = True

        if root_children[root] > 1:
            is_cut[root] = True

    ans = []
    for i in range(1, n + 1):
        if is_cut[i]:
            ans.append(i)
    return ans