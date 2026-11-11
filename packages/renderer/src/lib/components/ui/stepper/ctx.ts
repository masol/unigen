import { getContext, setContext } from 'svelte';

const STEPPER_KEY = Symbol('stepper');

type StepperContext = {
	activeStep: () => number;
	setStep: (step: number) => void;
	orientation: () => 'horizontal' | 'vertical';
};

export function setStepperContext(props: StepperContext) {
	setContext(STEPPER_KEY, props);
}

export function getStepperContext() {
	return getContext<StepperContext>(STEPPER_KEY);
}
