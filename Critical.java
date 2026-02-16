import java.util.ArrayList;
import java.util.Arrays;

public class Critical {
    public ArrayList<Integer> critical(int n, int[][] edges) {
        ArrayList<Integer>[] g = new ArrayList[n];
        for (int i = 0; i < n; i++) g[i] = new ArrayList<>();

        for (int[] e : edges) {
            int a = e[0], b = e[1];
            if (a == b) continue;
            g[a].add(b);
            g[b].add(a);
        }

        int[] disc = new int[n];
        int[] low = new int[n];
        int[] parent = new int[n];
        int[] rootKids = new int[n];
        boolean[] cut = new boolean[n];

        Arrays.fill(disc, -1);
        Arrays.fill(parent, -1);

        int time = 0;

        int[] stV = new int[n];
        int[] stI = new int[n];
        boolean[] stEnter = new boolean[n];

        for (int root = 0; root < n; root++) {
            if (disc[root] != -1) continue;

            int top = 0;
            stV[top] = root;
            stI[top] = 0;
            stEnter[top] = true;

            while (top >= 0) {
                int v = stV[top];
                int idx = stI[top];
                boolean entering = stEnter[top];
                top--;

                if (entering) {
                    disc[v] = low[v] = time++;
                    top++;
                    stV[top] = v;
                    stI[top] = 0;
                    stEnter[top] = false;
                    continue;
                }

                if (idx < g[v].size()) {
                    int u = g[v].get(idx);

                    top++;
                    stV[top] = v;
                    stI[top] = idx + 1;
                    stEnter[top] = false;

                    if (disc[u] == -1) {
                        parent[u] = v;
                        if (v == root) rootKids[root]++;

                        top++;
                        stV[top] = u;
                        stI[top] = 0;
                        stEnter[top] = true;
                    } else if (u != parent[v]) {
                        if (disc[u] < low[v]) low[v] = disc[u];
                    }
                } else {
                    int p = parent[v];
                    if (p == -1) {
                        if (rootKids[v] > 1) cut[v] = true;
                    } else {
                        if (low[v] < low[p]) low[p] = low[v];
                        if (parent[p] != -1 && low[v] >= disc[p]) cut[p] = true;
                    }
                }
            }
        }

        ArrayList<Integer> ans = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            if (cut[i]) ans.add(i);
        }
        return ans;
    }
}