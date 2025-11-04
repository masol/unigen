// src/lib/stores/repository.svelte.ts
import { appDB } from '$lib/utils/appdb';
import type { ConfigItem } from '$lib/utils/appdb/cfgdb';
import { eventBus } from '$lib/utils/evt';
import { softinfo } from '$lib/utils/softinfo';


export interface Repository {
    id: string;
    name: string;
    path: string;
    ver: string;
    ctime: number;
}

export type RepoValue = {
    name: string;
    path: string;
    ver: string;
}

const KEYNAME = 'repository'

export function Item2Repo(item: ConfigItem): Repository {
    return {
        id: item.id,
        ctime: item.created_at,
        name: (item.value as RepoValue).name,
        ver: (item.value as RepoValue).ver || softinfo.version,
        path: (item.value as RepoValue).path,
    }
}
export function Repo2Value(repo: Repository): RepoValue {
    return {
        name: repo.name,
        path: repo.path,
        ver: repo.ver || softinfo.version,
    }
}


class RepositoryStore {
    private unsub: (() => void) | null = null;

    repositories = $state<Repository[]>([
    ]);

    selectedId = $state('');

    find(id: string) {
        return this.repositories.find(r => r.id === id);
    }

    setSelectedRepo(id: string) {
        this.selectedId = id;
    }

    setRepositories(repositories: Repository[]) {
        this.repositories = repositories;

        eventBus.emit<"repo.reset">("repo.reset", { length: repositories.length })

        // 检查 currentId 是否在新数组中有效，
        // @todo: 支持这个一致性检查，在projectStore中－－单向依赖．
        // if (this.currentId && !repositories.some(r => r.id === this.currentId)) {
        //     this.currentId = '';
        // }

        // 检查 selectedId 是否在新数组中有效
        if (this.selectedId && !repositories.some(r => r.id === this.selectedId)) {
            this.selectedId = '';
        }
    }

    private async updateDb(id: string, value: RepoValue) {
        await appDB.upsertById(id, KEYNAME, JSON.stringify(value), true)
    }

    async addRepository(repository: Repository) {
        this.repositories = [...this.repositories, repository];
        await this.updateDb(repository.id, Repo2Value(repository));
    }

    async removeRepository(id: string) {
        this.repositories = this.repositories.filter(r => r.id !== id);

        eventBus.emit<"repo.removed">("repo.removed", { id })
        // 如果删除的是当前仓库,设置为空．
        // if (this.currentId === id) {
        //     this.currentId = "";
        // }
        await appDB.remove(id, KEYNAME, true)
    }

    //isRepositorySame:检查一个repo是否与store中保存的不同。
    isRepositorySame(repo: Repository): boolean {
        const repoInStore = this.repositories.find(rs => rs.id === repo.id);
        if (!repoInStore) {
            return true; // 不同。
        }
        return repo.name === repoInStore.name && repo.path === repoInStore.path && repo.ver === repoInStore.ver;
    }


    async updateRepository(id: string, updates: Partial<Omit<Repository, 'id'>>) {
        this.repositories = this.repositories.map(repo =>
            repo.id === id ? { ...repo, ...updates } : repo
        );
        let repo = this.repositories.find(repo => repo.id === id);
        if (!repo) {
            repo = { id, ctime: Math.floor(Date.now() / 1000), ...updates } as Repository
            this.repositories.push(repo);
        }
        await this.updateDb(id, Repo2Value(repo as Repository));
    }

    // 从数据库中加载lang配置，如果数据库未配置，则返回false.
    private async loadFromDB(): Promise<boolean> {
        const cfgs = await appDB.getConfigsByKey(KEYNAME);
        if (cfgs) {
            const repos: Repository[] = cfgs.map(Item2Repo);
            this.setRepositories(repos);
            return true;
        }
        return false;
    }

    async init() {
        await this.loadFromDB();
        this.unsub = await eventBus.listen("cfgchanged:repository", this.loadFromDB.bind(this))
    }

    close() {
        if (this.unsub) {
            this.unsub();
            this.unsub = null;
        }
    }
}

export const repositoryStore = new RepositoryStore();