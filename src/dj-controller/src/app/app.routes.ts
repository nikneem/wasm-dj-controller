import { Routes } from '@angular/router';

export const routes: Routes = [
    {
        path: '',
        loadComponent: () => import('./pages/home/home-page/home-page').then(m => m.HomePage)
    }
];
