/*eslint no-loop-func:0, no-unused-vars:0*/
import {inject} from 'aurelia-dependency-injection';
import {ObserverLocator} from 'aurelia-binding';
import {
  BoundViewFactory,
  TargetInstruction,
  ViewSlot,
  ViewResources,
  customAttribute,
  bindable,
  templateController
} from 'aurelia-templating';
import {RepeatStrategyLocator} from './repeat-strategy-locator';
import {
  getItemsSourceExpression,
  unwrapExpression,
  isOneTime
} from './repeat-utilities';
import {viewsRequireLifecycle} from './analyze-view-factory';

/**
* Binding to iterate over iterable objects (Array, Map and Number) to genereate a template for each iteration.
*/
@customAttribute('repeat')
@templateController
@inject(BoundViewFactory, TargetInstruction, ViewSlot, ViewResources, ObserverLocator, RepeatStrategyLocator)
export class Repeat {
  /**
  * List of items to bind the repeater to.
  *
  * @property items
  */
  @bindable items
  /**
  * Local variable which gets assigned on each iteration.
  *
  * @property local
  */
  @bindable local
  /**
  * Key when iterating over Maps.
  *
  * @property key
  */
  @bindable key
  /**
  * Value when iterating over Maps.
  *
  * @property value
  */
  @bindable value

  /**
 * Creates an instance of Repeat.
 * @param viewFactory The factory generating the view
 * @param instruction The instructions for how the element should be enhanced.
 * @param viewResources Collection of resources used to compile the the views.
 * @param viewSlot The slot the view is injected in to.
 * @param observerLocator The observer locator instance.
 * @param collectionStrategyLocator The strategy locator to locate best strategy to iterate the collection.
 */
  constructor(viewFactory, instruction, viewSlot, viewResources, observerLocator, strategyLocator) {
    this.viewFactory = viewFactory;
    this.instruction = instruction;
    this.viewSlot = viewSlot;
    this.lookupFunctions = viewResources.lookupFunctions;
    this.observerLocator = observerLocator;
    this.local = 'item';
    this.key = 'key';
    this.value = 'value';
    this.strategyLocator = strategyLocator;
    this.ignoreMutation = false;
    this.sourceExpression = getItemsSourceExpression(this.instruction, 'repeat.for');
    this.isOneTime = isOneTime(this.sourceExpression);
    this.viewsRequireLifecycle = viewsRequireLifecycle(viewFactory);
  }

  call(context, changes) {
    this[context](this.items, changes);
  }

  /**
  * Binds the repeat to the binding context and override context.
  * @param bindingContext The binding context.
  * @param overrideContext An override context for binding.
  */
  bind(bindingContext, overrideContext) {
    this.scope = { bindingContext, overrideContext };
    this.itemsChanged();
  }

  /**
  * Unbinds the repeat
  */
  unbind() {
    this.scope = null;
    this.items = null;
    this.viewSlot.removeAll(true);
    this._unsubscribeCollection();
  }

  _unsubscribeCollection() {
    if (this.collectionObserver) {
      this.collectionObserver.unsubscribe(this.callContext, this);
      this.collectionObserver = null;
      this.callContext = null;
    }
  }

  /**
  * Invoked everytime the item property changes.
  */
  itemsChanged() {
    this._unsubscribeCollection();

    // still bound?
    if (!this.scope) {
      return;
    }

    let items = this.items;
    this.strategy = this.strategyLocator.getStrategy(items);

    if (!this.isOneTime && !this._observeInnerCollection()) {
      this._observeCollection();
    }
    this.strategy.instanceChanged(this, items);
  }

  _getInnerCollection() {
    let expression = unwrapExpression(this.sourceExpression);
    if (!expression) {
      return null;
    }
    return expression.evaluate(this.scope, null);
  }

  /**
  * Invoked when the underlying collection changes.
  */
  handleCollectionMutated(collection, changes) {
    this.strategy.instanceMutated(this, collection, changes);
  }

  /**
  * Invoked when the underlying inner collection changes.
  */
  handleInnerCollectionMutated(collection, changes) {
    // guard against source expressions that have observable side-effects that could
    // cause an infinite loop- eg a value converter that mutates the source array.
    if (this.ignoreMutation) {
      return;
    }
    this.ignoreMutation = true;
    let newItems = this.sourceExpression.evaluate(this.scope, this.lookupFunctions);
    this.observerLocator.taskQueue.queueMicroTask(() => this.ignoreMutation = false);

    // collection change?
    if (newItems === this.items) {
      return;
    }
    // assign the new value to the items property, which will trigger the
    // self-subscriber to call itemsChanged.
    this.items = newItems;
  }

  _observeInnerCollection() {
    let items = this._getInnerCollection();
    let strategy = this.strategyLocator.getStrategy(items);
    if (!strategy) {
      return false;
    }
    this.collectionObserver = strategy.getCollectionObserver(this.observerLocator, items);
    if (!this.collectionObserver) {
      return false;
    }
    this.callContext = 'handleInnerCollectionMutated';
    this.collectionObserver.subscribe(this.callContext, this);
    return true;
  }

  _observeCollection() {
    let items = this.items;
    this.collectionObserver = this.strategy.getCollectionObserver(this.observerLocator, items);
    if (this.collectionObserver) {
      this.callContext = 'handleCollectionMutated';
      this.collectionObserver.subscribe(this.callContext, this);
    }
  }
}
