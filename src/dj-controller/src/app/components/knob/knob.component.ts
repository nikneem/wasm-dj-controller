import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-knob',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="knob-container">
            <div class="knob-label" *ngIf="label">{{ label }}</div>
            <div 
                class="knob" 
                [class.active]="isDragging"
                (mousedown)="onMouseDown($event)"
                [style.transform]="'rotate(' + rotation + 'deg)'">
                <div class="knob-marker"></div>
                <div class="knob-value">{{ displayValue }}</div>
            </div>
            <div class="knob-value-label">{{ value }}</div>
        </div>
    `,
    styles: [`
        .knob-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            user-select: none;
        }

        .knob-label {
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
            color: var(--text-secondary, #94a3b8);
            letter-spacing: 1px;
        }

        .knob {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: linear-gradient(145deg, #1e293b, #0f172a);
            border: 3px solid #334155;
            box-shadow: 
                inset 0 2px 8px rgba(0, 0, 0, 0.6),
                0 4px 12px rgba(0, 0, 0, 0.4);
            cursor: pointer;
            position: relative;
            transition: border-color 0.2s, box-shadow 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .knob:hover {
            border-color: #475569;
            box-shadow: 
                inset 0 2px 8px rgba(0, 0, 0, 0.6),
                0 4px 16px rgba(0, 0, 0, 0.5);
        }

        .knob.active {
            border-color: #f97316;
            box-shadow: 
                inset 0 2px 8px rgba(0, 0, 0, 0.6),
                0 4px 16px rgba(249, 115, 22, 0.3),
                0 0 20px rgba(249, 115, 22, 0.2);
        }

        .knob-marker {
            position: absolute;
            top: 5px;
            left: 50%;
            transform: translateX(-50%);
            width: 4px;
            height: 18px;
            background: linear-gradient(to bottom, #f97316, #ea580c);
            border-radius: 2px;
            box-shadow: 0 0 8px rgba(249, 115, 22, 0.6);
        }

        .knob-value {
            font-size: 10px;
            font-weight: bold;
            color: #64748b;
            font-family: 'Courier New', monospace;
        }

        .knob-value-label {
            font-size: 11px;
            font-weight: bold;
            color: #f97316;
            font-family: 'Courier New', monospace;
            min-width: 50px;
            text-align: center;
        }
    `]
})
export class KnobComponent implements OnInit, OnDestroy {
    @Input() label: string = '';
    @Input() value: number = 0;
    @Input() min: number = -255;
    @Input() max: number = 255;
    @Input() step: number = 1;
    @Output() valueChange = new EventEmitter<number>();

    rotation: number = 0;
    isDragging: boolean = false;
    startY: number = 0;
    startValue: number = 0;
    displayValue: string = '0';

    private readonly ROTATION_RANGE = 270; // Total rotation range in degrees (-135 to +135)
    private readonly SENSITIVITY = 0.5; // Pixels per unit change

    ngOnInit(): void {
        this.updateRotation();
    }

    ngOnDestroy(): void {
        this.stopDragging();
    }

    onMouseDown(event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();

        this.isDragging = true;
        this.startY = event.clientY;
        this.startValue = this.value;

        document.body.style.cursor = 'ns-resize';
    }

    @HostListener('document:mousemove', ['$event'])
    onMouseMove(event: MouseEvent): void {
        if (!this.isDragging) return;

        event.preventDefault();

        const deltaY = this.startY - event.clientY; // Inverted: up is positive
        const valueRange = this.max - this.min;
        const valueChange = (deltaY / this.SENSITIVITY) * (valueRange / 500); // Scale to reasonable range

        let newValue = this.startValue + valueChange;
        newValue = Math.max(this.min, Math.min(this.max, newValue));
        newValue = Math.round(newValue / this.step) * this.step;

        if (newValue !== this.value) {
            this.value = newValue;
            this.updateRotation();
            this.valueChange.emit(this.value);
        }
    }

    @HostListener('document:mouseup')
    onMouseUp(): void {
        if (this.isDragging) {
            this.stopDragging();
        }
    }

    private stopDragging(): void {
        this.isDragging = false;
        document.body.style.cursor = '';
    }

    private updateRotation(): void {
        // Map value to rotation angle
        // 0 = 0 degrees (marker pointing up)
        // min = -135 degrees
        // max = +135 degrees
        const valueRange = this.max - this.min;
        const normalizedValue = (this.value - this.min) / valueRange; // 0 to 1
        this.rotation = (normalizedValue - 0.5) * this.ROTATION_RANGE;

        this.displayValue = this.value === 0 ? '•' : '';
    }
}
